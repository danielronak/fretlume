"""Synthetic data command line (docs/specs/06-testing-and-data.md §2).

  python -m synth.cli frames --count 200 --seed 0 --out DIR          # independent frames (benches)
  python -m synth.cli clip --kind track-hand --frames 45 --seed 3 --out DIR [--format png --stamp]

Frames are written as raw 8-bit grayscale (`000000.gray`, row-major) or PNG (`000000.png`, colour),
with one JSON object per line in `labels.jsonl`:
  {index, width, height, instrument, H (3×3, board mm → image px), control_points (4×2 px),
   polarity, board, inlays, hand: {fret, cells} | null, guitar: bool}
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from .instrument import INSTRUMENTS, Instrument, project
from .render import (camera_effects, composite, draw_hand, draw_torso, render_background,
                     render_neck_texture, sample_hand, sample_look, stamp_index)
from .scenes import Pose, sample_pose, trajectory

KINDS = ['lock-easy', 'track-hand', 'track-motion', 'lefty', 'capo', 'low-light', 'no-guitar', 'static-noise', 'random']


def write_frame(out: Path, index: int, frame8: np.ndarray, fmt: str) -> None:
    if fmt == 'gray':
        gray = cv2.cvtColor(frame8, cv2.COLOR_BGR2GRAY)
        (out / f'{index:06d}.gray').write_bytes(gray.tobytes())
    else:
        cv2.imwrite(str(out / f'{index:06d}.png'), frame8)


def label(index: int, w: int, h: int, inst: Instrument, H: np.ndarray | None, look, hand, guitar: bool) -> dict:
    return {
        'index': index, 'width': w, 'height': h, 'instrument': inst.id, 'guitar': guitar,
        'H': None if H is None else H.tolist(),
        'control_points': None if H is None else project(H, inst.control_points()).tolist(),
        'polarity': look.polarity if look else None, 'board': look.board if look else None,
        'inlays': look.inlays if look else None,
        'capo_fret': look.capo_fret if look else 0,
        'hand': None if hand is None else {'fret': hand.fret, 'cells': hand.cells},
    }


def render_one(rng, inst, look, texture, alpha, pose: Pose, bg, hand, *, w, h, low_light=False, motion=(0.0, 0.0),
               guitar=True):
    H = pose.homography(inst)
    scene = bg.copy()
    if guitar:
        draw_torso(np.random.default_rng(look.seed), scene, H, inst)
        frame = composite(texture, alpha, H, scene)
        if hand is not None:
            draw_hand(frame, H, inst, hand)
    else:
        frame = scene
    return camera_effects(rng, frame.astype(np.float32), low_light=low_light, motion_px=motion), H


def cmd_frames(args) -> None:
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(args.seed)
    w, h = args.width, args.height
    with open(out / 'labels.jsonl', 'w') as labels:
        for i in range(args.count):
            inst = INSTRUMENTS[str(rng.choice(list(INSTRUMENTS), p=[0.45, 0.4, 0.15]))]
            look = sample_look(rng, inst)
            texture, alpha = render_neck_texture(inst, look)
            pose = sample_pose(rng, w, h)
            hand = sample_hand(rng, inst) if rng.random() < args.hand_prob else None
            bg = render_background(rng, w, h)
            frame8, H = render_one(rng, inst, look, texture, alpha, pose, bg, hand, w=w, h=h)
            write_frame(out, i, frame8, args.format)
            labels.write(json.dumps(label(i, w, h, inst, H, look, hand, True)) + '\n')


def cmd_clip(args) -> None:
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(args.seed)
    w, h, kind = args.width, args.height, args.kind
    inst = INSTRUMENTS[args.instrument or ('electric' if kind == 'lefty' else 'steel-acoustic')]
    look = sample_look(rng, inst, board='rosewood' if kind in ('lock-easy', 'track-hand', 'track-motion') else None,
                       capo_fret=2 if kind == 'capo' else 0)
    if kind in ('lock-easy', 'track-hand', 'track-motion', 'capo') and look.inlays == 'none':
        look.inlays = 'dots'
    texture, alpha = render_neck_texture(inst, look)
    base = sample_pose(rng, w, h, headstock='left' if kind == 'lefty' else 'right' if kind != 'random' else None,
                       easy=kind in ('lock-easy', 'track-hand', 'track-motion', 'lefty', 'capo', 'low-light', 'static-noise'))
    motion = {'lock-easy': 'static', 'static-noise': 'static', 'track-motion': 'move', 'no-guitar': 'static'}.get(kind, 'sway')
    poses = trajectory(rng, base, inst, args.frames, motion=motion)
    bg = render_background(rng, w, h)
    hand_rng = np.random.default_rng(args.seed + 1)
    hand = sample_hand(hand_rng, inst, fret=3) if kind in ('track-hand', 'track-motion', 'random') else None
    with open(out / 'labels.jsonl', 'w') as labels:
        prev = None
        for i, pose in enumerate(poses):
            if hand is not None and i % 30 == 15:  # move to another chord now and then
                hand = sample_hand(hand_rng, inst, fret=float(np.clip(hand.fret + hand_rng.integers(-3, 4), 1, 10)))
            H_now = pose.homography(inst)
            motion_px = (0.0, 0.0)
            if prev is not None:
                d = project(H_now, inst.control_points()) - project(prev, inst.control_points())
                motion_px = tuple(d.mean(0))
            frame_rng = np.random.default_rng(args.seed * 100_003 + i)
            frame8, H = render_one(frame_rng, inst, look, texture, alpha, pose, bg, hand, w=w, h=h,
                                   low_light=kind == 'low-light', motion=motion_px, guitar=kind != 'no-guitar')
            if args.stamp:
                stamp_index(frame8, i)
            write_frame(out, i, frame8, args.format)
            labels.write(json.dumps(label(i, w, h, inst, H if kind != 'no-guitar' else None, look, hand,
                                          kind != 'no-guitar')) + '\n')
            prev = H_now


def main() -> None:
    parser = argparse.ArgumentParser(prog='synth')
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ('frames', 'clip'):
        p = sub.add_parser(name)
        p.add_argument('--out', required=True)
        p.add_argument('--seed', type=int, default=0)
        p.add_argument('--width', type=int, default=1280)
        p.add_argument('--height', type=int, default=720)
        p.add_argument('--format', choices=['gray', 'png'], default='gray')
    sub.choices['frames'].add_argument('--count', type=int, default=200)
    sub.choices['frames'].add_argument('--hand-prob', type=float, default=0.5)
    sub.choices['clip'].add_argument('--kind', choices=KINDS, required=True)
    sub.choices['clip'].add_argument('--frames', type=int, default=45)
    sub.choices['clip'].add_argument('--instrument', choices=list(INSTRUMENTS))
    sub.choices['clip'].add_argument('--stamp', action='store_true', help='write the frame number into the image')
    args = parser.parse_args()
    {'frames': cmd_frames, 'clip': cmd_clip}[args.command](args)


if __name__ == '__main__':
    main()
