"""Camera framing and smooth motion for synthetic clips.

A pose places the neck in the image the way a laptop camera sees a player: nut near one edge, neck
across most of the frame, tilted, slightly foreshortened. In the raw (unmirrored) camera image a
right-handed player's headstock is on the right and the treble side faces down.
"""
from __future__ import annotations

from dataclasses import dataclass, replace

import cv2
import numpy as np

from .instrument import Instrument


@dataclass(frozen=True)
class Pose:
    nut_x: float          # image px of the nut centre
    nut_y: float
    angle: float          # radians: direction of +x (toward the bridge) in the image
    scale: float          # px per mm along the neck at the nut
    persp: float          # scale at the 12th fret relative to the nut (perspective)
    squash: float         # across-neck foreshortening (0.6–1.0)
    treble_down: bool = True

    def homography(self, inst: Instrument) -> np.ndarray:
        u = np.array([np.cos(self.angle), np.sin(self.angle)])
        v = np.array([-u[1], u[0]])  # +y in the image, 90° from u
        if (v[1] < 0) == self.treble_down:
            v = -v
        x12 = float(inst.fret_x(12))
        nut = np.array([self.nut_x, self.nut_y])
        src = inst.control_points()
        dst = []
        for x, y in src:
            s = self.scale * (1 + (self.persp - 1) * x / x12)
            dst.append(nut + u * x * self.scale * (1 + (self.persp - 1) * x / x12 / 2) * 1.0 + v * y * s * self.squash)
        return cv2.getPerspectiveTransform(src.astype(np.float32), np.array(dst, np.float32)).astype(np.float64)


def sample_pose(rng: np.random.Generator, w: int, h: int, *, headstock: str | None = None,
                easy: bool = False) -> Pose:
    side = headstock or ('right' if rng.random() < 0.75 else 'left')
    tilt = np.deg2rad(rng.uniform(-8, 8) if easy else rng.uniform(-22, 22))
    # Neck from the nut toward the body: leftwards when the headstock is on the right.
    angle = (np.pi if side == 'right' else 0.0) + tilt
    scale = rng.uniform(1.9, 2.5) if easy else rng.uniform(1.4, 2.8)
    nut_x = w * (rng.uniform(0.82, 0.92) if side == 'right' else rng.uniform(0.08, 0.18))
    nut_y = h * (rng.uniform(0.38, 0.55) if easy else rng.uniform(0.25, 0.7))
    return Pose(
        nut_x=float(nut_x), nut_y=float(nut_y), angle=float(angle), scale=float(scale),
        persp=float(rng.uniform(0.92, 1.08) if easy else rng.uniform(0.8, 1.2)),
        squash=float(rng.uniform(0.8, 0.95) if easy else rng.uniform(0.6, 1.0)),
    )


def control_points_px(pose: Pose, inst: Instrument) -> np.ndarray:
    from .instrument import project

    return project(pose.homography(inst), inst.control_points())


def trajectory(rng: np.random.Generator, base: Pose, inst: Instrument, frames: int, *,
               motion: str = 'sway', max_px_per_frame: float = 15.0) -> list[Pose]:
    """Smooth pose sequence. 'static' adds nothing; 'sway' breathes a little; 'move' also repositions."""
    if motion == 'static':
        return [base] * frames
    t = np.arange(frames) / 30.0
    f1, f2 = rng.uniform(0.15, 0.45, 2)
    ph = rng.uniform(0, 2 * np.pi, 4)
    amp = 1.0 if motion == 'sway' else 2.5
    dx = amp * 6 * np.sin(2 * np.pi * f1 * t + ph[0])
    dy = amp * 5 * np.sin(2 * np.pi * f2 * t + ph[1])
    da = amp * np.deg2rad(0.8) * np.sin(2 * np.pi * f1 * t + ph[2])
    ds = amp * 0.015 * np.sin(2 * np.pi * f2 * t + ph[3])
    if motion == 'move':  # one or two smooth repositionings (half a second each)
        for _ in range(int(rng.integers(1, 3))):
            start = int(rng.integers(5, max(6, frames - 20)))
            target = rng.normal(0, [40, 30, np.deg2rad(4), 0.05])
            ramp = np.clip((np.arange(frames) - start) / 15.0, 0, 1)
            ramp = ramp * ramp * (3 - 2 * ramp)
            dx += target[0] * ramp
            dy += target[1] * ramp
            da += target[2] * ramp
            ds += target[3] * ramp
    poses = [replace(base, nut_x=base.nut_x + dx[i], nut_y=base.nut_y + dy[i], angle=base.angle + da[i],
                     scale=base.scale * (1 + ds[i])) for i in range(frames)]
    # Respect the speed limit by slowing the whole clip down if any step is too fast.
    pts = np.array([control_points_px(p, inst) for p in poses])
    speed = np.max(np.linalg.norm(np.diff(pts, axis=0), axis=2), initial=0)
    if speed > max_px_per_frame:
        k = max_px_per_frame / speed
        poses = [replace(base, nut_x=base.nut_x + dx[i] * k, nut_y=base.nut_y + dy[i] * k,
                         angle=base.angle + da[i] * k, scale=base.scale * (1 + ds[i] * k)) for i in range(frames)]
    return poses
