"""Parametric instrument geometry in millimetres — the Python twin of app/src/core/guitar/instrument.ts.

Board frame: origin at the centre of the nut's fretboard-side edge; +x toward the bridge; +y toward the
treble side (string 1). Control points (docs/specs/01-vision.md §1): C0 = nut bass corner, C1 = nut treble
corner, C2 = 12th-fret treble corner, C3 = 12th-fret bass corner.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Instrument:
    id: str
    strings: int
    scale_mm: float
    frets: int
    nut_width_mm: float
    width12_mm: float
    spread_nut_mm: float
    spread_bridge_mm: float
    body_joint_fret: int

    def fret_x(self, n):
        return self.scale_mm * (1.0 - 2.0 ** (-np.asarray(n, dtype=np.float64) / 12.0))

    def half_width(self, x):
        x12 = float(self.fret_x(12))
        return 0.5 * (self.nut_width_mm + (self.width12_mm - self.nut_width_mm) * np.asarray(x) / x12)

    def spread(self, x):
        return self.spread_nut_mm + (self.spread_bridge_mm - self.spread_nut_mm) * np.asarray(x) / self.scale_mm

    def string_y(self, s, x):
        """y of string s (1 = high e at +y)."""
        return self.spread(x) * ((self.strings + 1) / 2 - s) / (self.strings - 1)

    def finger_x(self, fret: int) -> float:
        if fret == 0:
            return -9.0
        a, b = float(self.fret_x(fret - 1)), float(self.fret_x(fret))
        return a + 0.62 * (b - a)

    def control_points(self) -> np.ndarray:
        x12 = float(self.fret_x(12))
        w0, w12 = self.nut_width_mm / 2, self.width12_mm / 2
        return np.array([[0, -w0], [0, w0], [x12, w12], [x12, -w12]], np.float64)

    @property
    def board_end_x(self) -> float:
        return float(self.fret_x(self.frets)) + 6.0


INSTRUMENTS = {
    'steel-acoustic': Instrument('steel-acoustic', 6, 645, 20, 43, 54, 36, 55, 14),
    'electric': Instrument('electric', 6, 648, 22, 42, 52, 35, 52, 16),
    'classical': Instrument('classical', 6, 650, 19, 52, 62, 43, 58, 12),
}


def project(H: np.ndarray, pts: np.ndarray) -> np.ndarray:
    p = np.c_[pts, np.ones(len(pts))] @ H.T
    return p[:, :2] / p[:, 2:3]
