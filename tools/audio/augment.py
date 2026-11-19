"""Augmentations (docs/specs/02-audio.md §7): room, laptop-mic band limit, noise, level."""
from __future__ import annotations

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt


def room(x: np.ndarray, sr: int, rng: np.random.Generator) -> tuple[np.ndarray, str]:
    rt60 = rng.uniform(0.15, 0.6)
    n = int(rt60 * sr)
    t = np.arange(n) / sr
    ir = rng.standard_normal(n) * np.exp(-6.9 * t / rt60)
    ir[0] = 1.0 / rng.uniform(0.15, 0.4)  # direct sound stronger than the tail
    ir /= np.max(np.abs(ir))
    wet = fftconvolve(x, ir)[: len(x)]
    return wet / (np.max(np.abs(wet)) or 1) * np.max(np.abs(x)), f"room{rt60:.2f}"


def laptop_mic(x: np.ndarray, sr: int) -> tuple[np.ndarray, str]:
    sos = butter(4, [150, min(7000, sr / 2 - 100)], btype="band", fs=sr, output="sos")
    return sosfilt(sos, x), "band150-7k"


def _pink(n: int, rng: np.random.Generator) -> np.ndarray:
    spectrum = np.fft.rfft(rng.standard_normal(n))
    f = np.arange(len(spectrum))
    spectrum[1:] /= np.sqrt(f[1:])
    pink = np.fft.irfft(spectrum, n)
    return pink / (np.std(pink) or 1)


def _speech_shaped(n: int, sr: int, rng: np.random.Generator) -> np.ndarray:
    # Noise shaped like speech (300–3400 Hz) with a syllable-rate (~4 Hz) envelope.
    sos = butter(2, [300, 3400], btype="band", fs=sr, output="sos")
    noise = sosfilt(sos, rng.standard_normal(n))
    t = np.arange(n) / sr
    envelope = 0.55 + 0.45 * np.sin(2 * np.pi * rng.uniform(3, 5) * t + rng.uniform(0, 6.28))
    noise *= envelope
    return noise / (np.std(noise) or 1)


def noise(x: np.ndarray, sr: int, rng: np.random.Generator) -> tuple[np.ndarray, str]:
    snr = rng.uniform(10, 30)
    kind = "pink" if rng.uniform() < 0.5 else "speech"
    n = _pink(len(x), rng) if kind == "pink" else _speech_shaped(len(x), sr, rng)
    signal_rms = np.sqrt(np.mean(x[np.abs(x) > 1e-4] ** 2)) if np.any(np.abs(x) > 1e-4) else 0.1
    return x + n * signal_rms / (10 ** (snr / 20)), f"{kind}{snr:.0f}dB"


def level(x: np.ndarray, rng: np.random.Generator) -> tuple[np.ndarray, str]:
    db = rng.uniform(-24, 0)
    return x * 10 ** (db / 20), f"{db:.0f}dB"


def chain(x: np.ndarray, sr: int, rng: np.random.Generator) -> tuple[np.ndarray, str]:
    """A random chain: each step with some probability; at least one step."""
    steps = []
    if rng.uniform() < 0.6:
        x, s = room(x, sr, rng)
        steps.append(s)
    if rng.uniform() < 0.5:
        x, s = laptop_mic(x, sr)
        steps.append(s)
    if rng.uniform() < 0.7 or not steps:
        x, s = noise(x, sr, rng)
        steps.append(s)
    x, s = level(x, rng)
    steps.append(s)
    return x, "+".join(steps)
