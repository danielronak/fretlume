"""Render the audio fixture plan (phase 6 task 6.1).

Reads fixtures/generated/audio/plan.json (written by `npm run fixtures:audio`, step 1), renders every
group with each of its sources — our Karplus–Strong twin (`ks`) and FluidSynth's General MIDI guitars
(`steel`, `nylon`, `electric`) — plus an augmented copy, and writes one WAV per group and source with
`manifest.json` holding the ground truth and the start time of every item.

Usage: uv run --project tools/audio python tools/audio/render.py [--force] [--groups notes,chords]
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
import wave
import zlib
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

import augment
import ks
from midi import Midi

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "fixtures/generated/audio"
SOUNDFONT = Path("/usr/share/sounds/sf2/FluidR3_GM.sf2")
PROGRAMS = {"nylon": 24, "steel": 25, "electric": 27}  # GM: nylon, steel, clean electric
GAP = 0.3
RELEASE = 0.06


def layout(items: list[dict]) -> list[float]:
    starts, t = [], 0.2
    for item in items:
        starts.append(t)
        t += item["dur"] + GAP
    return starts


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def read_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path)) as w:
        sr, ch, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(w.getnframes())
    dtype = {2: np.int16, 4: np.int32}[width]
    x = np.frombuffer(raw, dtype=dtype).astype(np.float64) / np.iinfo(dtype).max
    return x.reshape(-1, ch).mean(axis=1), sr


def write_wav(path: Path, x: np.ndarray, sr: int) -> None:
    pcm = (np.clip(x, -1, 1) * 32767).round().astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def _ks_item(args: tuple[dict, float, int, int]) -> tuple[int, np.ndarray]:
    item, start, sr, seed = args
    length = round((item["dur"] + 0.5) * sr)
    out = np.zeros(length)
    for k, note in enumerate(item["notes"]):
        f = hz(note["midi"] + item["detuneCents"] / 100)
        vel = note["velocity"] / 127
        y = ks.pluck(f, sr, note["dur"] + RELEASE, seed=seed * 131 + k, brightness=0.3 + 0.5 * vel)
        r = round(RELEASE * sr)
        y[-r:] *= np.linspace(1, 0, r)  # the finger damps the string on release
        i = round(note["t"] * sr)
        n = min(len(y), length - i)
        out[i : i + n] += vel**1.5 * y[:n]
    return round(start * sr), out


def render_ks(items: list[dict], starts: list[float], sr: int, total: int) -> np.ndarray:
    out = np.zeros(total)
    jobs = [(item, s, sr, i + 1) for i, (item, s) in enumerate(zip(items, starts))]
    with ProcessPoolExecutor() as pool:
        for i, y in pool.map(_ks_item, jobs, chunksize=8):
            n = min(len(y), total - i)
            out[i : i + n] += y[:n]
    return out


def render_fluid(items: list[dict], starts: list[float], sr: int, total: int, program: int) -> np.ndarray:
    m = Midi()
    for ch in range(6):
        m.program(ch, program)
    for item, start in zip(items, starts):
        for ch in range(6):
            m.bend_cents(max(0.0, start - 0.05), ch, item["detuneCents"])
        for note in item["notes"]:
            m.note(start + note["t"], note["dur"], note["string"] - 1, note["midi"], note["velocity"])
    with tempfile.TemporaryDirectory() as tmp:
        mid, wav = Path(tmp) / "g.mid", Path(tmp) / "g.wav"
        mid.write_bytes(m.to_bytes())
        subprocess.run(
            ["fluidsynth", "-ni", "-q", "-R", "0", "-C", "0", "-g", "0.6", "-r", str(sr),
             "-O", "s16", "-T", "wav", "-F", str(wav), str(SOUNDFONT), str(mid)],
            check=True, capture_output=True,
        )
        x, got = read_wav(wav)
    if got != sr:
        raise RuntimeError(f"fluidsynth rendered at {got} Hz, wanted {sr}")
    out = np.zeros(total)
    out[: min(total, len(x))] = x[:total]
    return out


def normalise(x: np.ndarray, peak: float = 0.8) -> np.ndarray:
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--groups", default="")
    args = parser.parse_args()
    plan = json.loads((OUT / "plan.json").read_text())
    sr = plan["sampleRate"]
    wanted = set(filter(None, args.groups.split(",")))
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() and not args.force else {"groups": []}
    manifest["sampleRate"] = sr
    have = {g["file"] for g in manifest["groups"]}
    if not shutil.which("fluidsynth") or not SOUNDFONT.exists():
        print("FluidSynth or the GM soundfont is missing: rendering the ks source only")

    for group in plan["groups"]:
        if wanted and group["name"] not in wanted:
            continue
        items, starts = group["items"], layout(group["items"])
        total = round((starts[-1] + items[-1]["dur"] + 1.0) * sr)
        for source in group["sources"]:
            if source != "ks" and (not shutil.which("fluidsynth") or not SOUNDFONT.exists()):
                continue
            for aug in ([False, True] if group["augment"] else [False]):
                name = f"{group['name']}-{source}{'-aug' if aug else ''}.wav"
                if name in have and (OUT / name).exists() and not args.force:
                    print(f"kept   {name}")
                    continue
                if not aug:
                    x = render_ks(items, starts, sr, total) if source == "ks" else render_fluid(
                        items, starts, sr, total, PROGRAMS[source])
                    x = normalise(x)
                    conditions = ["clean"] * len(items)
                else:
                    x, _ = read_wav(OUT / name.replace("-aug", ""))
                    rng = np.random.default_rng(zlib.crc32(name.encode()))
                    conditions = []
                    for item, start in zip(items, starts):
                        a, b = round(start * sr), round((start + item["dur"] + GAP) * sr)
                        y, cond = augment.chain(x[a:b].copy(), sr, rng)
                        x[a:b] = y
                        conditions.append(cond)
                    x = np.clip(x, -1, 1)
                write_wav(OUT / name, x, sr)
                manifest["groups"] = [g for g in manifest["groups"] if g["file"] != name]
                manifest["groups"].append({
                    "file": name, "group": group["name"], "source": source, "augmented": aug,
                    "items": [
                        {**item, "start": round(start, 4), "condition": cond}
                        for item, start, cond in zip(items, starts, conditions)
                    ],
                })
                manifest_path.write_text(json.dumps(manifest))
                print(f"wrote  {name} ({len(x) / sr / 60:.1f} min)")


if __name__ == "__main__":
    main()
