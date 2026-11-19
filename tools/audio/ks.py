"""Python twin of the app's extended Karplus–Strong string (app/src/audio/dsp/karplus.ts).

The loop (two-point average, fractional all-pass, loop gain) is a linear filter, so the whole string is
rendered with one `scipy.signal.lfilter` call instead of a Python sample loop.
"""
from __future__ import annotations

import numpy as np
from scipy.signal import lfilter


def pluck(f_hz: float, sr: int, seconds: float, *, seed: int, brightness: float = 0.5,
          pick_position: float = 0.13, t60: float | None = None) -> np.ndarray:
    period = sr / f_hz
    L = max(2, int(np.floor(period - 0.5 - 0.1)))
    delta = period - 0.5 - L
    C = (1 - delta) / (1 + delta)
    if t60 is None:
        t60 = max(1.5, 4.5 - np.log2(f_hz / 82.4) * 0.9)
    g = 10 ** (-3 / (t60 * f_hz))

    rng = np.random.default_rng(seed)
    white = rng.uniform(-1, 1, L)
    a = 0.25 + 0.7 * brightness
    excitation = lfilter([a], [1, -(1 - a)], white)  # one-pole low-pass for warmth
    d = max(1, round(L * pick_position))
    excitation[d:] = excitation[d:] - excitation[:-d].copy()  # pick-position comb
    excitation -= excitation.mean()

    n = round(seconds * sr)
    x = np.zeros(n)
    x[:L] = excitation
    # y = x + g · H_avg(z) · H_ap(z) · z^-L · y, with H_avg = (1 + z^-1)/2, H_ap = (C + z^-1)/(1 + C z^-1).
    # ⇒ Y/X = (1 + C z^-1) / ((1 + C z^-1) − g/2 · (C + (1 + C) z^-1 + z^-2) · z^-L)
    den = np.zeros(L + 3)
    den[0] = 1.0
    den[1] += C
    den[L] -= g / 2 * C
    den[L + 1] -= g / 2 * (1 + C)
    den[L + 2] -= g / 2
    y = lfilter([1.0, C], den, x)
    peak = np.max(np.abs(y[: min(n, 4 * L)])) or 1.0
    return y / peak
