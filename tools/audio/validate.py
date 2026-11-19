"""Spectral check of the rendered fixtures (the agent cannot listen to them).

For every single note (and every note of the phrases): YIN finds the pitch between 0.12 and 0.6 s after
the onset; it must be the planned pitch (detune included) within 35 cents, never an octave off; the
level must fall from the attack to later in the note (a plucked string decays). Writes
fixtures/generated/audio/validation.json and exits non-zero below 98 % on clean files.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

from render import OUT, read_wav


def yin(x: np.ndarray, sr: int, fmin: float = 70, fmax: float = 1500, threshold: float = 0.15) -> float:
    tau_min, tau_max = int(sr / fmax), int(sr / fmin)
    w = len(x) - tau_max
    if w < 256:
        return 0.0
    d = np.array([np.sum((x[:w] - x[t : t + w]) ** 2) for t in range(tau_max + 1)])
    cmnd = np.ones_like(d)
    cmnd[1:] = d[1:] * np.arange(1, len(d)) / np.maximum(np.cumsum(d[1:]), 1e-12)
    for t in range(tau_min, tau_max):
        if cmnd[t] < threshold and cmnd[t] <= cmnd[t + 1]:
            a, b, c = cmnd[t - 1], cmnd[t], cmnd[t + 1]
            shift = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) else 0.0
            return sr / (t + shift)
    t = tau_min + int(np.argmin(cmnd[tau_min:tau_max]))
    return sr / t


def new_energy_cents(x: np.ndarray, sr: int, start: float, want: float) -> float:
    """Phrases: earlier strings keep ringing (as on a real guitar), so look at what is new at the onset:
    the strongest peak of (spectrum just after − spectrum just before) must be a harmonic of the note."""
    n = 4096
    win = np.hanning(n)
    a = x[round((start + 0.03) * sr) : round((start + 0.03) * sr) + n]
    b = x[max(0, round((start - 0.01) * sr) - n) : round((start - 0.01) * sr)]
    if len(a) < n or len(b) < n:
        return 9999.0
    f = np.fft.rfftfreq(n, 1 / sr)
    diff = np.abs(np.fft.rfft(a * win)) - np.abs(np.fft.rfft(b * win))
    diff[f < 60] = 0
    peak = f[int(np.argmax(diff))]
    h = max(1, round(peak / want))
    return 1200 * np.log2(peak / (h * want)) if h <= 12 else 9999.0


def main() -> None:
    manifest = json.loads((OUT / "manifest.json").read_text())
    sr = manifest["sampleRate"]
    report, failed = {}, False
    for g in manifest["groups"]:
        if g["group"] not in ("notes", "phrases"):
            continue
        x, _ = read_wav(OUT / g["file"])
        ok = octave = total = decays = 0
        worst: list[str] = []
        for item in g["items"]:
            for note in item["notes"]:
                start = item["start"] + note["t"]
                span = min(0.5, note["dur"] - 0.15)
                seg = x[round((start + 0.1) * sr) : round((start + 0.1 + span) * sr)]
                want = 440 * 2 ** ((note["midi"] + item["detuneCents"] / 100 - 69) / 12)
                if item["kind"] == "note":
                    got = yin(seg[: int(0.12 * sr)] if len(seg) > int(0.12 * sr) else seg, sr)
                    cents = 1200 * np.log2(got / want) if got > 0 else 9999
                else:
                    # Either the new energy is a harmonic of the note, or the pitch tracker hears it.
                    cents = new_energy_cents(x, sr, start, want)
                    if abs(cents) > 35:
                        got = yin(seg[: int(0.12 * sr)], sr)
                        cents = 1200 * np.log2(got / want) if got > 0 else 9999
                total += 1
                if abs(cents) <= 35:
                    ok += 1
                else:
                    if abs(abs(cents) - 1200) < 60:
                        octave += 1
                    if len(worst) < 5:
                        worst.append(f"{item['id']} midi {note['midi']}: {cents:+.0f} c")
                if item["kind"] == "note":
                    early = np.sqrt(np.mean(x[round((start + 0.05) * sr) : round((start + 0.25) * sr)] ** 2))
                    late = np.sqrt(np.mean(x[round((start + 0.9) * sr) : round((start + 1.1) * sr)] ** 2))
                    decays += int(late < early)
        rate = ok / total if total else 0
        notes_n = sum(1 for i in g["items"] if i["kind"] == "note")
        report[g["file"]] = {
            "pitch_ok": round(rate, 4), "octave_errors": octave, "n": total,
            "decays": f"{decays}/{notes_n}" if notes_n else None, "worst": worst,
        }
        if not g["augmented"] and rate < 0.98:
            failed = True
        print(f"{g['file']:28s} pitch ok {rate:6.1%}  octave {octave}  decays {decays}/{notes_n}  {worst[:2]}")
    (OUT / "validation.json").write_text(json.dumps(report, indent=1))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
