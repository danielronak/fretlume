"""Generator v2: training and validation shards for NeckNet (phase 4 task 4.1, specs/06 §2).

Frames are rendered at 2× the network input (576×320) and area-downscaled to 288×160, as a real camera
frame would be. Neck textures come from a per-worker pool (rendered at 1 px/mm, refreshed as the run
goes) so a worker produces hundreds of frames per second.

Shards are `.npz` files: JPEG bytes (`jpeg`, `offsets`) and labels:
  cps (N,4,2) control points C0..C3 in input px; presence (N,); orientation (N,) 1 = headstock on the
  image's right; profile (N,) 0 steel-acoustic / 1 electric / 2 classical; mask (N,40,72) fretboard at
  stride 4; H (N,9) board mm → input px; board (N,) and inlay (N,) family indices.

Usage:
  python -m synth.dataset shards --split train --frames 300000 --out data/train --workers 4
  python -m synth.dataset sheet --shard data/val-b/000000.npz --out sheet.png
"""
from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import time
from dataclasses import replace
from pathlib import Path

import cv2
import numpy as np

from .instrument import INSTRUMENTS, Instrument, project
from .render import (BOARD_FAMILIES, INLAY_FAMILIES_V2, composite, draw_hand, render_neck_texture,
                     sample_hand, sample_look)
from .scenes import Pose

IN_W, IN_H = 288, 160
RENDER_SCALE = 2
STRIDE = 4
PROFILES = ['steel-acoustic', 'electric', 'classical']

# Held-out families for val-B: a board, two inlay styles and a clothing pattern never seen in training.
HELD_OUT = {'board': {'pau-ferro'}, 'inlays': {'trapezoids', 'blobs'}, 'clothing': {'checks'}}
CLOTHING = ['plain', 'stripes', 'print', 'checks']


def families(split: str) -> dict[str, list[str]]:
    held = split == 'val-b'

    def pick(all_: list[str], key: str) -> list[str]:
        return [f for f in all_ if (f in HELD_OUT[key]) == held] if held else [f for f in all_ if f not in HELD_OUT[key]]

    boards = pick(BOARD_FAMILIES, 'board')
    inlays = pick(INLAY_FAMILIES_V2, 'inlays')
    clothing = pick(CLOTHING, 'clothing')
    if held:  # val-B mixes held-out and known families so each frame has at least one new factor
        boards, inlays, clothing = boards + ['rosewood'], inlays + ['dots'], clothing + ['plain']
    return {'board': boards, 'inlays': inlays, 'clothing': clothing}


def sample_look_v2(rng: np.random.Generator, inst: Instrument, fam: dict[str, list[str]]):
    look = sample_look(rng, inst, board=str(rng.choice(fam['board'])), capo_fret=int(rng.integers(1, 8)) if rng.random() < 0.08 else 0)
    inlays = str(rng.choice(fam['inlays']))
    if look.board == 'maple' and inlays in ('blocks', 'trapezoids'):
        inlays = 'dots'
    inlay_rgb = look.inlay_rgb
    if rng.random() < 0.3:  # mother-of-pearl / abalone tints
        inlay_rgb = np.clip(rng.uniform(0.6, 1.0, 3), 0, 1)
    return replace(
        look, inlays=inlays, inlay_rgb=inlay_rgb,
        wire_width=float(rng.uniform(1.6, 3.0)),
        binding=bool(rng.random() < 0.35), nylon=inst.id == 'classical',
        glare=float(rng.uniform(0.1, 0.5)) if rng.random() < 0.25 else 0.0,
        wear=float(rng.uniform(0.1, 0.35)) if rng.random() < 0.2 else 0.0,
    )


def sample_pose_v2(rng: np.random.Generator, inst: Instrument, w: int, h: int) -> Pose:
    """Neck spanning 40–110 % of the frame width, roll ±35°, perspective, mirrored or not, partly cut off."""
    headstock_right = rng.random() < 0.6
    roll = np.deg2rad(rng.uniform(-35, 35) if rng.random() < 0.5 else rng.uniform(-12, 12))
    angle = (np.pi if headstock_right else 0.0) + roll
    span = rng.uniform(0.4, 1.1) * w  # px from nut to the end of the board
    scale = span / inst.board_end_x
    u = np.array([np.cos(angle), np.sin(angle)])
    # Place the middle of the board somewhere in the frame; ends may leave it.
    centre = np.array([rng.uniform(0.25, 0.75) * w, rng.uniform(0.25, 0.75) * h])
    nut = centre - u * span / 2
    return Pose(nut_x=float(nut[0]), nut_y=float(nut[1]), angle=float(angle), scale=float(scale),
                persp=float(rng.uniform(0.75, 1.25)), squash=float(rng.uniform(0.55, 1.0)),
                treble_down=bool(rng.random() < 0.5))


def muted(rng: np.random.Generator, lo: float = 0.05, hi: float = 0.9) -> list[float]:
    """A colour as rooms and clothes have them: mostly greyish, sometimes saturated."""
    grey = rng.uniform(lo, hi)
    sat = rng.uniform(0.0, 0.25) if rng.random() < 0.8 else rng.uniform(0.25, 0.6)
    return [float(v) for v in np.clip(grey + (rng.uniform(0, 1, 3) - 0.5) * sat, 0, 1)]


_VIGNETTE: dict[tuple[int, int], np.ndarray] = {}


def camera_v2(rng: np.random.Generator, frame: np.ndarray, *, low_light: bool) -> np.ndarray:
    """Exposure, white balance, defocus, sensor noise, vignetting and JPEG, at the network's size."""
    h, w = frame.shape[:2]
    gain = rng.uniform(0.2, 0.45) if low_light else rng.uniform(0.7, 1.3)
    out = frame * (gain * rng.uniform(0.9, 1.1, 3)).astype(np.float32)
    if rng.random() < 0.6:
        out = cv2.GaussianBlur(out, (0, 0), float(rng.uniform(0.3, 1.0)))
    sigma = rng.uniform(0.02, 0.05) if low_light else rng.uniform(0.003, 0.02)
    out += rng.normal(0, sigma, out.shape).astype(np.float32)
    if (h, w) not in _VIGNETTE:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        _VIGNETTE[(h, w)] = ((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2
    out *= (1 - 0.25 * rng.uniform(0, 1) * _VIGNETTE[(h, w)])[..., None]
    out8 = (np.clip(out, 0, 1) * 255).astype(np.uint8)
    ok, enc = cv2.imencode('.jpg', out8, [cv2.IMWRITE_JPEG_QUALITY, int(rng.uniform(45, 95))])
    return cv2.imdecode(enc, cv2.IMREAD_COLOR) if ok else out8


def background_v2(rng: np.random.Generator, w: int, h: int) -> np.ndarray:
    """Rooms, clutter and things that look like frets (blinds, radiators, fences, keyboards, ladders)."""
    wall = np.array(muted(rng, 0.15, 0.9), np.float32)
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    bg = np.broadcast_to(wall * (0.75 + 0.4 * yy * rng.uniform(-1, 1)), (h, w, 3)).copy()
    if rng.random() < 0.5:  # window with bloom
        x0, y0 = int(rng.uniform(0, w * 0.8)), int(rng.uniform(0, h * 0.4))
        win = np.zeros((h, w), np.float32)
        cv2.rectangle(win, (x0, y0), (x0 + int(w * rng.uniform(0.1, 0.3)), y0 + int(h * rng.uniform(0.2, 0.6))), 1.0, -1)
        bg += cv2.GaussianBlur(win, (0, 0), w * 0.01)[..., None] * rng.uniform(0.4, 0.9)
    for _ in range(int(rng.integers(2, 9))):
        p = (rng.uniform(-0.1, 1.1, (int(rng.integers(3, 6)), 2)) * [w, h]).astype(np.int32)
        cv2.fillPoly(bg, [p], muted(rng, 0.02, 0.95))
    for _ in range(int(rng.integers(0, 3))):  # periodic distractors
        kind = rng.integers(4)
        x0, y0 = rng.uniform(-0.1, 0.8) * w, rng.uniform(-0.1, 0.8) * h
        length, n = rng.uniform(0.2, 0.7) * w, int(rng.integers(6, 20))
        ang = rng.uniform(-np.pi, np.pi)
        d = np.array([np.cos(ang), np.sin(ang)])
        e = np.array([-d[1], d[0]])
        col = muted(rng, 0.0, 1.0)
        gap = length / n
        bar = rng.uniform(0.15, 0.5) * length
        thick = max(1, int(w * rng.uniform(0.002, 0.008)))
        if kind == 3:  # a keyboard: a band with keys
            o = np.array([x0, y0])
            corners = np.array([o, o + d * length, o + d * length + e * bar * 0.3, o + e * bar * 0.3])
            cv2.fillPoly(bg, [corners.astype(np.int32)], (0.92, 0.92, 0.9))
            bar *= 0.3
            col = [0.05, 0.05, 0.05]
        for k in range(n):
            a = np.array([x0, y0]) + d * gap * k
            b = a + e * bar
            cv2.line(bg, tuple(int(v) for v in a), tuple(int(v) for v in b), col, thick, cv2.LINE_AA)
        if kind == 1:  # a ladder/fence: rails along both ends
            for t in (0.0, 1.0):
                a = np.array([x0, y0]) + e * bar * t
                cv2.line(bg, tuple(int(v) for v in a), tuple(int(v) for v in a + d * length), col, thick * 2, cv2.LINE_AA)
    noise = cv2.GaussianBlur(rng.normal(0, 1, (max(1, h // 8), max(1, w // 8))).astype(np.float32), (0, 0), 1.5)
    bg += cv2.resize(noise, (w, h))[..., None] * 0.04
    return np.clip(bg, 0, 1)


def torso_v2(rng: np.random.Generator, bg: np.ndarray, H: np.ndarray, inst: Instrument, clothing: str) -> None:
    h, w = bg.shape[:2]
    c = project(H, np.array([[float(inst.fret_x(inst.body_joint_fret)) + 200, 0.0]]))[0]
    color = muted(rng, 0.03, 0.9)
    cx, cy = int(c[0]), int(c[1] - h * 0.15)
    rx, ry = int(w * rng.uniform(0.18, 0.3)), int(h * rng.uniform(0.6, 0.8))
    mask = np.zeros((h, w), np.uint8)
    cv2.ellipse(mask, (cx, cy), (rx, ry), 0, 0, 360, 255, -1)
    layer = np.empty_like(bg)
    layer[:] = color
    if clothing == 'stripes':
        step = max(2, int(h * rng.uniform(0.02, 0.06)))
        ink = muted(rng, 0.0, 1.0)
        for y in range(0, h, step * 2):
            cv2.rectangle(layer, (0, y), (w, y + step), ink, -1)
    elif clothing == 'checks':
        step = max(2, int(h * rng.uniform(0.03, 0.07)))
        ink = muted(rng, 0.0, 1.0)
        for y in range(0, h, step):
            for x in range((y // step) % 2 * step, w, step * 2):
                cv2.rectangle(layer, (x, y), (x + step, y + step), ink, -1)
    elif clothing == 'print':  # blocky shapes that look a little like lettering
        ink = muted(rng, 0.0, 1.0)
        size = int(h * rng.uniform(0.05, 0.12))
        for k in range(int(rng.integers(3, 8))):
            x0 = cx - 3 * size + k * int(size * 1.4)
            cv2.rectangle(layer, (x0, cy - size), (x0 + size, cy), ink, int(rng.choice([-1, max(1, size // 5)])))
    m = (mask > 0)[..., None]
    bg[:] = np.where(m, layer, bg)
    # Strumming arm across the body.
    a = project(H, np.array([[float(inst.fret_x(inst.body_joint_fret)) + 260, -120.0]]))[0]
    b = project(H, np.array([[float(inst.fret_x(inst.body_joint_fret)) + 200, 40.0]]))[0]
    width = max(2, int(np.linalg.norm(project(H, np.array([[0.0, 0.0], [60.0, 0.0]]))[1] - project(H, np.array([[0.0, 0.0]]))[0])))
    if rng.random() < 0.7:
        cv2.line(bg, tuple(int(v) for v in a), tuple(int(v) for v in b), color, width, cv2.LINE_AA)


class Worker:
    """One process's generator: a texture pool and the frame sampler."""

    def __init__(self, split: str, seed: int, pool: int = 40):
        self.rng = np.random.default_rng(seed)
        self.fam = families(split)
        self.pool: list[tuple[Instrument, object, np.ndarray, np.ndarray]] = []
        for _ in range(pool):
            self.pool.append(self._texture())

    def _texture(self):
        inst = INSTRUMENTS[str(self.rng.choice(PROFILES, p=[0.45, 0.4, 0.15]))]
        look = sample_look_v2(self.rng, inst, self.fam)
        tex, alpha = render_neck_texture(inst, look, pxmm=1.0)
        return inst, look, tex, alpha

    def frame(self, negative: bool) -> tuple[np.ndarray, dict]:
        rng = self.rng
        if rng.random() < 0.01:  # refresh the pool slowly
            self.pool[int(rng.integers(len(self.pool)))] = self._texture()
        w, h = IN_W * RENDER_SCALE, IN_H * RENDER_SCALE
        bg = background_v2(rng, w, h).astype(np.float32)
        inst, look, tex, alpha = self.pool[int(rng.integers(len(self.pool)))]
        label: dict = {'presence': 0, 'profile': PROFILES.index(inst.id), 'board': -1, 'inlay': -1}
        if negative:
            if rng.random() < 0.5:  # a person in view, no guitar
                torso_v2(rng, bg, sample_pose_v2(rng, inst, w, h).homography(inst), inst,
                         str(rng.choice(self.fam['clothing'])))
            frame = bg
        else:
            pose = sample_pose_v2(rng, inst, w, h)
            H = pose.homography(inst)
            torso_v2(rng, bg, H, inst, str(rng.choice(self.fam['clothing'])))
            frame = composite(tex, alpha, H, bg)
            if rng.random() < 0.3:
                draw_hand(frame, H, inst, sample_hand(rng, inst))
            down = np.diag([1 / RENDER_SCALE, 1 / RENDER_SCALE, 1.0])
            Hin = down @ H
            label.update(presence=1, H=Hin, inst=inst, look=look)
        small = cv2.resize(frame.astype(np.float32), (IN_W, IN_H), interpolation=cv2.INTER_AREA)
        return camera_v2(rng, small, low_light=rng.random() < 0.15), label


def finish_label(label: dict) -> dict:
    """Arrays for one frame (fills the guitar-free case with zeros)."""
    out = {
        'cps': np.zeros((4, 2), np.float32), 'presence': np.uint8(label['presence']),
        'orientation': np.uint8(0), 'profile': np.uint8(label['profile']),
        'mask': np.zeros((IN_H // STRIDE, IN_W // STRIDE), np.uint8), 'H': np.zeros(9, np.float32),
        'board': np.int8(-1), 'inlay': np.int8(-1),
    }
    if not label['presence']:
        return out
    inst: Instrument = label['inst']
    H = label['H']
    cps = project(H, inst.control_points())
    out['cps'] = cps.astype(np.float32)
    nut = cps[:2].mean(0)
    twelve = cps[2:].mean(0)
    out['orientation'] = np.uint8(nut[0] > twelve[0])
    end = inst.board_end_x
    board = np.array([[0, -inst.half_width(0)], [end, -inst.half_width(end)], [end, inst.half_width(end)],
                      [0, inst.half_width(0)]], np.float64)
    poly = project(H, board) / STRIDE
    cv2.fillPoly(out['mask'], [np.round(poly * 16).astype(np.int32)], 1, lineType=cv2.LINE_8, shift=4)
    out['H'] = (H / H[2, 2]).reshape(9).astype(np.float32)
    look = label['look']
    out['board'] = np.int8(BOARD_FAMILIES.index(look.board))
    out['inlay'] = np.int8(INLAY_FAMILIES_V2.index(look.inlays))
    return out


def write_shard(path: Path, split: str, seed: int, count: int, negatives: float) -> int:
    worker = Worker(split, seed)
    rng = np.random.default_rng(seed + 7)
    blobs: list[bytes] = []
    labels: list[dict] = []
    for _ in range(count):
        img, label = worker.frame(negative=split == 'negatives' or rng.random() < negatives)
        ok, enc = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 92])
        assert ok
        blobs.append(enc.tobytes())
        labels.append(finish_label(label))
    offsets = np.cumsum([0] + [len(b) for b in blobs]).astype(np.int64)
    arrays = {k: np.stack([lab[k] for lab in labels]) for k in labels[0]}
    np.savez(path, jpeg=np.frombuffer(b''.join(blobs), np.uint8), offsets=offsets, **arrays)
    return count


def _job(args):
    return write_shard(*args)


def cmd_shards(args) -> None:
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    n_shards = (args.frames + args.shard - 1) // args.shard
    base = {'train': 1_000_000, 'val-a': 2_000_000, 'val-b': 3_000_000, 'negatives': 4_000_000}[args.split] + args.seed
    jobs = []
    for i in range(n_shards):
        path = out / f'{i:06d}.npz'
        if path.exists():
            continue
        count = min(args.shard, args.frames - i * args.shard)
        jobs.append((path, args.split, base + i * 9973, count, args.negatives))
    t0 = time.time()
    done = 0
    with mp.Pool(args.workers) as pool:
        for n in pool.imap_unordered(_job, jobs):
            done += n
            rate = done / max(1e-6, time.time() - t0)
            print(f'{done} frames, {rate:.0f}/s', flush=True)
    (out / 'meta.json').write_text(json.dumps({'split': args.split, 'frames': args.frames, 'shard': args.shard,
                                               'negatives': args.negatives, 'seed': args.seed,
                                               'families': families(args.split)}, indent=1))


def load_shard(path: str | Path) -> dict:
    with np.load(path) as z:
        return {k: z[k] for k in z.files}


def decode(shard: dict, i: int) -> np.ndarray:
    a, b = shard['offsets'][i], shard['offsets'][i + 1]
    return cv2.imdecode(shard['jpeg'][a:b], cv2.IMREAD_COLOR)


def cmd_sheet(args) -> None:
    """10×10 contact sheet with the labelled control points and board mask outline."""
    shard = load_shard(args.shard)
    tiles = []
    for i in range(min(100, len(shard['offsets']) - 1)):
        img = decode(shard, i)
        if shard['presence'][i]:
            m = cv2.resize(shard['mask'][i] * 255, (IN_W, IN_H), interpolation=cv2.INTER_NEAREST)
            contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(img, contours, -1, (0, 255, 255), 1)
            for k, (x, y) in enumerate(shard['cps'][i]):
                cv2.circle(img, (int(x), int(y)), 3, [(0, 0, 255), (0, 255, 0), (255, 0, 0), (255, 0, 255)][k], -1)
        tiles.append(img)
    while len(tiles) % 10:
        tiles.append(np.zeros_like(tiles[0]))
    sheet = np.vstack([np.hstack(tiles[r:r + 10]) for r in range(0, len(tiles), 10)])
    cv2.imwrite(args.out, sheet)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('shards')
    s.add_argument('--split', choices=['train', 'val-a', 'val-b', 'negatives'], required=True)
    s.add_argument('--frames', type=int, required=True)
    s.add_argument('--shard', type=int, default=2048)
    s.add_argument('--out', required=True)
    s.add_argument('--workers', type=int, default=4)
    s.add_argument('--seed', type=int, default=0)
    s.add_argument('--negatives', type=float, default=0.12, help='fraction of frames without a guitar')
    c = sub.add_parser('sheet')
    c.add_argument('--shard', required=True)
    c.add_argument('--out', required=True)
    args = parser.parse_args()
    {'shards': cmd_shards, 'sheet': cmd_sheet}[args.cmd](args)


if __name__ == '__main__':
    main()
