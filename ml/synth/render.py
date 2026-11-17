"""Neck texture, scene and camera rendering for synthetic frames (docs/specs/06-testing-and-data.md §2).

Everything is drawn in a metric texture (board millimetres) and then warped into the image with the
ground-truth homography H (board mm → image px), so labels are exact.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from .instrument import Instrument, project

PXMM = 2.5  # texture pixels per millimetre
TEX_X0, TEX_X1 = -210.0, 1010.0
TEX_Y0, TEX_Y1 = -200.0, 200.0
TEX_W = int((TEX_X1 - TEX_X0) * PXMM)
TEX_H = int((TEX_Y1 - TEX_Y0) * PXMM)
TEX = np.array([[PXMM, 0, -TEX_X0 * PXMM], [0, PXMM, -TEX_Y0 * PXMM], [0, 0, 1]], np.float64)

BOARD_FAMILIES = ['rosewood', 'ebony', 'maple', 'pau-ferro', 'richlite']
INLAY_FAMILIES = ['dots', 'blocks', 'none']


@dataclass
class Look:
    """Appearance of one guitar; sampled once per clip so a sequence keeps the same guitar."""

    board: str
    board_rgb: np.ndarray
    wire_rgb: np.ndarray
    wire_width: float
    inlays: str
    inlay_rgb: np.ndarray
    nut_rgb: np.ndarray
    nut_width: float
    neck_rgb: np.ndarray
    body_rgb: np.ndarray
    body_kind: str
    headstock: str
    string_rgb: np.ndarray
    wound_rgb: np.ndarray
    capo_fret: int = 0
    seed: int = 0

    @property
    def polarity(self) -> str:
        """'bright' when wires are lighter than the board, else 'dark'."""
        return 'bright' if self.wire_rgb.mean() > self.board_rgb.mean() else 'dark'


def sample_look(rng: np.random.Generator, instrument: Instrument, board: str | None = None,
                capo_fret: int = 0) -> Look:
    board = board or str(rng.choice(BOARD_FAMILIES, p=[0.4, 0.15, 0.15, 0.15, 0.15]))
    tint = rng.uniform(0.85, 1.15, 3)
    if board == 'rosewood':
        board_rgb = np.array([0.10, 0.15, 0.24]) * rng.uniform(0.7, 1.3)  # BGR
    elif board == 'ebony':
        board_rgb = np.array([0.05, 0.05, 0.06]) * rng.uniform(0.7, 1.4)
    elif board == 'maple':
        board_rgb = np.array([0.55, 0.72, 0.85]) * rng.uniform(0.85, 1.05)
    elif board == 'pau-ferro':
        board_rgb = np.array([0.16, 0.25, 0.36]) * rng.uniform(0.8, 1.2)
    else:
        board_rgb = np.array([0.07, 0.07, 0.07]) * rng.uniform(0.8, 1.3)
    board_rgb = np.clip(board_rgb * tint, 0, 1)
    if board == 'maple':
        wire = rng.uniform(0.45, 0.62)  # nickel against a light board reads darker
    else:
        wire = rng.uniform(0.55, 0.92)
    inlays = str(rng.choice(INLAY_FAMILIES, p=[0.6, 0.15, 0.25] if board != 'maple' else [0.8, 0.0, 0.2]))
    inlay_rgb = (np.array([0.1, 0.1, 0.1]) if board == 'maple' else np.array([0.85, 0.86, 0.84])) * rng.uniform(0.85, 1.1)
    nut_choice = rng.integers(3)
    nut_rgb = [np.array([0.78, 0.86, 0.9]), np.array([0.08, 0.08, 0.08]), np.array([0.35, 0.65, 0.78])][nut_choice]
    body_kind = 'acoustic' if instrument.id != 'electric' else 'electric'
    if body_kind == 'acoustic':
        body_rgb = [np.array([0.45, 0.68, 0.85]), np.array([0.1, 0.25, 0.45]), np.array([0.05, 0.05, 0.05])][rng.integers(3)]
    else:
        body_rgb = np.clip(rng.uniform(0, 1, 3) * rng.uniform(0.3, 1.0), 0, 1)
    neck_rgb = np.clip(rng.choice([board_rgb * 1.3, np.array([0.3, 0.5, 0.65]), np.array([0.05, 0.05, 0.05])]), 0, 1)
    return Look(
        board=board, board_rgb=board_rgb, wire_rgb=np.full(3, wire), wire_width=float(rng.uniform(1.8, 2.8)),
        inlays=inlays, inlay_rgb=np.clip(inlay_rgb, 0, 1), nut_rgb=nut_rgb, nut_width=float(rng.uniform(3, 6)),
        neck_rgb=neck_rgb, body_rgb=body_rgb, body_kind=body_kind,
        headstock=str(rng.choice(['3+3', '6-in-line'] if instrument.id == 'electric' else ['3+3', 'slotted'])),
        string_rgb=np.array([0.72, 0.72, 0.7]), wound_rgb=np.array([0.42, 0.62, 0.72]) if body_kind == 'acoustic' else np.array([0.6, 0.6, 0.6]),
        capo_fret=capo_fret, seed=int(rng.integers(1 << 30)),
    )


def _tex(pts_mm) -> np.ndarray:
    pts = np.asarray(pts_mm, np.float64)
    return np.round((pts - [TEX_X0, TEX_Y0]) * PXMM * 16).astype(np.int32)  # 4 fractional bits


def render_neck_texture(inst: Instrument, look: Look) -> tuple[np.ndarray, np.ndarray]:
    """BGR float texture of headstock, neck, fretboard and body, plus an alpha mask."""
    rng = np.random.default_rng(look.seed)
    img = np.zeros((TEX_H, TEX_W, 3), np.float32)
    alpha = np.zeros((TEX_H, TEX_W), np.float32)

    def poly(pts, color, a=1.0):
        cv2.fillPoly(img, [_tex(pts)], [float(c) for c in color], lineType=cv2.LINE_AA, shift=4)
        cv2.fillPoly(alpha, [_tex(pts)], a, lineType=cv2.LINE_AA, shift=4)

    def ellipse(cx, cy, rx, ry, color, a=1.0):
        center = (int(round((cx - TEX_X0) * PXMM * 16)), int(round((cy - TEX_Y0) * PXMM * 16)))
        axes = (int(rx * PXMM * 16), int(ry * PXMM * 16))
        cv2.ellipse(img, center, axes, 0, 0, 360, [float(c) for c in color], -1, cv2.LINE_AA, shift=4)
        cv2.ellipse(alpha, center, axes, 0, 0, 360, a, -1, cv2.LINE_AA, shift=4)

    hw0 = float(inst.half_width(0))
    end = inst.board_end_x
    # Body (behind the neck), starting near the body joint.
    joint = float(inst.fret_x(inst.body_joint_fret))
    if look.body_kind == 'acoustic':
        ellipse(joint + 120, 0, 135, 130, look.body_rgb)  # upper bout
        ellipse(joint + 330, 0, 190, 185, look.body_rgb)  # lower bout
        poly([[joint + 100, -120], [joint + 330, -170], [joint + 330, 170], [joint + 100, 120]], look.body_rgb)
    else:
        poly([[joint - 20, -150], [joint + 300, -175], [joint + 330, 175], [joint - 20, 150], [joint + 40, 0]], look.body_rgb)
    # Neck under the fretboard, a little wider, and the headstock.
    poly([[-8, -hw0 - 1.5], [end + 40, -float(inst.half_width(end)) - 2], [end + 40, float(inst.half_width(end)) + 2], [-8, hw0 + 1.5]], look.neck_rgb)
    if look.headstock == '6-in-line':
        poly([[-8, -hw0 - 2], [-190, -hw0 + 6], [-200, hw0 + 30], [-30, hw0 + 22], [-8, hw0 + 2]], look.neck_rgb)
        for k in range(6):
            ellipse(-40 - k * 26, hw0 + 16, 5, 5, np.array([0.7, 0.7, 0.7]))
    else:
        poly([[-8, -hw0 - 2], [-60, -hw0 - 14], [-190, -hw0 - 22], [-200, 0], [-190, hw0 + 22], [-60, hw0 + 14], [-8, hw0 + 2]], look.neck_rgb)
        for k in range(3):
            for side in (-1, 1):
                ellipse(-70 - k * 42, side * (hw0 + 6), 6, 6, np.array([0.7, 0.7, 0.7]))
    # Sound hole / pickups over the body.
    if look.body_kind == 'acoustic':
        ellipse(joint + 170, 0, 47, 47, np.array([0.03, 0.03, 0.03]))
        cv2.ellipse(img, (int((joint + 170 - TEX_X0) * PXMM), int(-TEX_Y0 * PXMM)), (int(54 * PXMM), int(54 * PXMM)), 0, 0, 360, (0.85, 0.85, 0.8), int(3 * PXMM), cv2.LINE_AA)
    else:
        for px in (joint + 90, joint + 190):
            poly([[px, -40], [px + 22, -40], [px + 22, 40], [px, 40]], np.array([0.1, 0.1, 0.1]))
    # Fretboard with wood grain.
    board = [[0, -hw0], [end, -float(inst.half_width(end))], [end, float(inst.half_width(end))], [0, hw0]]
    poly(board, look.board_rgb)
    board_mask = np.zeros((TEX_H, TEX_W), np.float32)
    cv2.fillPoly(board_mask, [_tex(board)], 1.0, lineType=cv2.LINE_AA, shift=4)
    grain = cv2.GaussianBlur(rng.normal(0, 1, (TEX_H, TEX_W)).astype(np.float32), (0, 0), 6, sigmaY=0.8)
    img += (grain * (0.05 if look.board != 'maple' else 0.03))[..., None] * board_mask[..., None]
    # Inlays.
    if look.inlays != 'none':
        for n in (3, 5, 7, 9, 12, 15, 17, 19, 21):
            if n > inst.frets:
                continue
            a, b = float(inst.fret_x(n - 1)), float(inst.fret_x(n))
            xm = 0.5 * (a + b)
            if look.inlays == 'dots':
                r = float(rng.uniform(2.6, 3.6))
                for y in ((-9.5, 9.5) if n == 12 else (0.0,)):
                    ellipse(xm, y, r, r, look.inlay_rgb)
            else:
                hw = float(inst.half_width(xm)) * 0.75
                w = (b - a) * 0.55
                poly([[xm - w / 2, -hw], [xm + w / 2, -hw], [xm + w / 2, hw], [xm - w / 2, hw]], look.inlay_rgb)
    # Nut.
    poly([[-look.nut_width, -hw0 - 0.5], [0, -hw0 - 0.5], [0, hw0 + 0.5], [-look.nut_width, hw0 + 0.5]], look.nut_rgb)
    # Fret wires, with a highlight line so they read as metal.
    fw = look.wire_width
    for n in range(1, inst.frets + 1):
        x = float(inst.fret_x(n))
        hw = float(inst.half_width(x))
        poly([[x - fw / 2, -hw], [x + fw / 2, -hw], [x + fw / 2, hw], [x - fw / 2, hw]], look.wire_rgb)
        poly([[x - fw / 8, -hw], [x + fw / 8, -hw], [x + fw / 8, hw], [x - fw / 8, hw]], np.minimum(look.wire_rgb * 1.25, 1))
    # Strings from behind the nut to the bridge (beyond the board).
    for s in range(1, inst.strings + 1):
        gauge = 0.25 + 0.12 * (s - 1)  # mm
        color = look.wound_rgb if s >= 4 else look.string_rgb
        y0, y1 = float(inst.string_y(s, -60)), float(inst.string_y(s, inst.scale_mm))
        p0 = (np.array([-60 - TEX_X0, y0 - TEX_Y0]) * PXMM * 16).astype(int)
        p1 = (np.array([inst.scale_mm - TEX_X0, y1 - TEX_Y0]) * PXMM * 16).astype(int)
        th = max(1, int(round(gauge * 2 * PXMM)))
        cv2.line(img, tuple(p0), tuple(p1), [float(c) for c in color], th, cv2.LINE_AA, shift=4)
    # Capo: a bar across all strings just behind the chosen fret.
    if look.capo_fret > 0:
        x = float(inst.fret_x(look.capo_fret)) - 6
        hw = float(inst.half_width(x))
        poly([[x - 7, -hw - 6], [x + 4, -hw - 6], [x + 4, hw + 6], [x - 7, hw + 6]], np.array([0.12, 0.12, 0.14]))
    return np.clip(img, 0, 1), np.clip(alpha, 0, 1)


@dataclass
class Hand:
    """A fretting hand: palm below the treble edge, four finger capsules on chosen cells."""

    fret: float  # index finger fret
    cells: list[tuple[int, int]] = field(default_factory=list)  # (string, fret) per finger
    skin_bgr: tuple[float, float, float] = (0.55, 0.65, 0.85)
    thumb_over: bool = False


def sample_hand(rng: np.random.Generator, inst: Instrument, fret: float | None = None) -> Hand:
    f = float(fret if fret is not None else rng.uniform(1, 12))
    base = int(round(f))
    cells = [(int(rng.integers(1, inst.strings + 1)), min(inst.frets, max(1, base + k))) for k in range(4)]
    tone = rng.choice([0.35, 0.55, 0.75, 0.95])
    skin = (0.45 * tone + 0.12, 0.6 * tone + 0.12, 0.8 * tone + 0.15)
    return Hand(fret=f, cells=cells, skin_bgr=skin, thumb_over=bool(rng.random() < 0.3))


def draw_hand(frame: np.ndarray, H: np.ndarray, inst: Instrument, hand: Hand) -> np.ndarray:
    """Draw the hand in image space; returns the hand mask."""
    h, w = frame.shape[:2]
    mask = np.zeros((h, w), np.float32)
    xi = float(inst.fret_x(max(0.0, hand.fret - 1)))
    palm_board = np.array([[xi + 22, -float(inst.half_width(xi)) - 34]])  # below the treble... sign below
    # Treble side is +y; the palm sits beyond the treble edge.
    palm_board[0, 1] = float(inst.half_width(xi)) + 34
    palm = project(H, palm_board)[0]
    scale = np.linalg.norm(project(H, np.array([[xi, 0.0]]))[0] - project(H, np.array([[xi + 10, 0.0]]))[0]) / 10  # px/mm
    cv2.ellipse(mask, (int(palm[0]), int(palm[1])), (int(42 * scale), int(30 * scale)), 0, 0, 360, 1.0, -1, cv2.LINE_AA)
    for string, fret in hand.cells:
        tip = project(H, np.array([[inst.finger_x(fret), float(inst.string_y(string, inst.finger_x(fret)))]]))[0]
        cv2.line(mask, (int(palm[0]), int(palm[1])), (int(tip[0]), int(tip[1])), 1.0, max(3, int(14 * scale)), cv2.LINE_AA)
        cv2.circle(mask, (int(tip[0]), int(tip[1])), max(2, int(7 * scale)), 1.0, -1, cv2.LINE_AA)
    if hand.thumb_over:
        thumb = project(H, np.array([[xi + 15, -float(inst.half_width(xi)) - 6]]))[0]
        back = project(H, np.array([[xi + 25, -float(inst.half_width(xi)) - 30]]))[0]
        cv2.line(mask, (int(back[0]), int(back[1])), (int(thumb[0]), int(thumb[1])), 1.0, max(3, int(16 * scale)), cv2.LINE_AA)
    shade = np.array(hand.skin_bgr, np.float32)
    frame[:] = frame * (1 - mask[..., None]) + shade * mask[..., None]
    return mask


def render_background(rng: np.random.Generator, w: int, h: int) -> np.ndarray:
    """A room: wall gradient, window, furniture blocks, a lamp, and some noise texture."""
    wall = rng.uniform(0.25, 0.85, 3).astype(np.float32)
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    bg = np.broadcast_to(wall * (0.8 + 0.3 * yy), (h, w, 3)).copy()
    if rng.random() < 0.6:  # window
        x0, y0 = int(rng.uniform(0, w * 0.7)), int(rng.uniform(0, h * 0.3))
        cv2.rectangle(bg, (x0, y0), (x0 + int(w * rng.uniform(0.15, 0.3)), y0 + int(h * rng.uniform(0.3, 0.6))), (0.95, 0.95, 0.92), -1)
    for _ in range(int(rng.integers(2, 7))):  # furniture and clutter with hard edges
        p = (rng.uniform(0, 1, (4, 2)) * [w, h]).astype(np.int32)
        cv2.fillPoly(bg, [p], [float(v) for v in rng.uniform(0.05, 0.9, 3)])
    if rng.random() < 0.4:  # striped object that mimics fret wires (blinds, radiator)
        x0, y0 = int(rng.uniform(0, w * 0.6)), int(rng.uniform(0, h * 0.6))
        for k in range(12):
            cv2.line(bg, (x0 + k * 14, y0), (x0 + k * 14, y0 + int(h * 0.3)), (0.9, 0.9, 0.9), 3)
    noise = cv2.GaussianBlur(rng.normal(0, 1, (h // 4, w // 4)).astype(np.float32), (0, 0), 2)
    bg += cv2.resize(noise, (w, h))[..., None] * 0.03
    return np.clip(bg, 0, 1)


def draw_torso(rng: np.random.Generator, bg: np.ndarray, H: np.ndarray, inst: Instrument) -> None:
    """The player's torso and clothing behind the guitar body."""
    h, w = bg.shape[:2]
    body_centre = project(H, np.array([[float(inst.fret_x(inst.body_joint_fret)) + 200, 0.0]]))[0]
    color = [float(v) for v in rng.uniform(0.05, 0.9, 3)]
    cx, cy = int(body_centre[0]), int(body_centre[1] - h * 0.15)
    cv2.ellipse(bg, (cx, cy), (int(w * 0.25), int(h * 0.7)), 0, 0, 360, color, -1, cv2.LINE_AA)
    if rng.random() < 0.5:  # stripes or a printed logo
        for k in range(-8, 9):
            y = cy + k * int(rng.uniform(18, 40))
            cv2.line(bg, (cx - int(w * 0.22), y), (cx + int(w * 0.22), y), [float(v) for v in rng.uniform(0, 1, 3)], int(rng.uniform(3, 10)))
    elif rng.random() < 0.5:  # a printed graphic: blocky shapes that look a little like lettering
        ink = [float(v) for v in rng.uniform(0, 1, 3)]
        for k in range(int(rng.integers(3, 7))):
            x0 = cx - 120 + k * 45
            cv2.rectangle(bg, (x0, cy - 60), (x0 + 30, cy - 10), ink, int(rng.choice([-1, 6])))


def camera_effects(rng: np.random.Generator, frame: np.ndarray, *, low_light: bool = False,
                   motion_px: tuple[float, float] = (0.0, 0.0), strength: float = 1.0) -> np.ndarray:
    gain = rng.uniform(0.25, 0.45) if low_light else rng.uniform(0.75, 1.25)
    out = frame * gain * rng.uniform(0.92, 1.08, 3).astype(np.float32)  # exposure and white balance
    mx, my = motion_px
    length = int(round(np.hypot(mx, my) * 0.5))
    if length >= 2:  # motion blur along the motion direction
        k = np.zeros((length * 2 + 1, length * 2 + 1), np.float32)
        cv2.line(k, (length - int(mx * 0.25), length - int(my * 0.25)), (length + int(mx * 0.25), length + int(my * 0.25)), 1.0, 1)
        out = cv2.filter2D(out, -1, k / max(k.sum(), 1))
    out = cv2.GaussianBlur(out, (0, 0), float(rng.uniform(0.5, 1.4) * strength))
    sigma = rng.uniform(0.02, 0.045) if low_light else rng.uniform(0.004, 0.02)
    out = out + rng.normal(0, sigma * strength, out.shape).astype(np.float32)
    h, w = out.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    vignette = 1 - 0.25 * (((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) * rng.uniform(0.3, 1)
    out = out * vignette[..., None]
    out8 = (np.clip(out, 0, 1) * 255).astype(np.uint8)
    q = int(rng.uniform(60, 95))
    ok, enc = cv2.imencode('.jpg', out8, [cv2.IMWRITE_JPEG_QUALITY, q])
    return cv2.imdecode(enc, cv2.IMREAD_COLOR) if ok else out8


def composite(texture: np.ndarray, alpha: np.ndarray, H: np.ndarray, bg: np.ndarray) -> np.ndarray:
    h, w = bg.shape[:2]
    M = H @ np.linalg.inv(TEX)
    fg = cv2.warpPerspective(texture, M, (w, h), flags=cv2.INTER_LINEAR)
    a = cv2.warpPerspective(alpha, M, (w, h), flags=cv2.INTER_LINEAR)[..., None]
    return fg * a + bg * (1 - a)


def stamp_index(frame8: np.ndarray, index: int) -> None:
    """Write a 16-bit frame number as black/white 8×8 blocks in the bottom-left corner (for e2e tests)."""
    h = frame8.shape[0]
    for bit in range(16):
        on = (index >> bit) & 1
        x0, y0 = bit * 8, h - 8
        frame8[y0:h, x0:x0 + 8] = 255 if on else 0
