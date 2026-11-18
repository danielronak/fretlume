"""Real-photo golden set tools (docs/specs/06-testing-and-data.md §3; phase 4 task 4.9).

Photos stay out of the repository (fixtures/generated/golden/, re-downloadable); labels.json, sources.json
and ATTRIBUTION.md are committed.

  uv run --project ml python tools/golden/golden.py prep <src_dir>        # → .rgb + grid sheets
  uv run --project ml python tools/golden/golden.py review                # → review renders of snapped labels
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'fixtures' / 'generated' / 'golden'
HERE = Path(__file__).resolve().parent


def prep(src: Path) -> None:
    """Raw RGBA copies for the TypeScript side, and gridded previews to read coordinates from."""
    WORK.mkdir(parents=True, exist_ok=True)
    meta = {}
    for f in sorted(src.glob('*.jpg')):
        img = cv2.imread(str(f), cv2.IMREAD_COLOR)
        if img is None:
            continue
        h, w = img.shape[:2]
        rgba = cv2.cvtColor(img, cv2.COLOR_BGR2RGBA)
        cv2.imwrite(str(WORK / f'{f.stem}.src.jpg'), img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        (WORK / f'{f.stem}.rgba').write_bytes(rgba.tobytes())
        meta[f.stem] = {'w': w, 'h': h}
        grid = img.copy()
        for x in range(0, w, 50):
            cv2.line(grid, (x, 0), (x, h), (0, 255, 255) if x % 100 == 0 else (0, 160, 160), 1)
            if x % 100 == 0:
                cv2.putText(grid, str(x), (x + 2, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1)
        for y in range(0, h, 50):
            cv2.line(grid, (0, y), (w, y), (0, 255, 255) if y % 100 == 0 else (0, 160, 160), 1)
            if y % 100 == 0:
                cv2.putText(grid, str(y), (2, y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1)
        cv2.imwrite(str(WORK / f'{f.stem}.grid.jpg'), grid, [cv2.IMWRITE_JPEG_QUALITY, 85])
    (WORK / 'meta.json').write_text(json.dumps(meta))
    print(f'{len(meta)} photos prepared in {WORK}')


def review() -> None:
    """Draw each snapped label: fret lines 0–12 with numbers, outer strings, and zoomed crops."""
    snapped = json.loads((WORK / 'snapped.json').read_text())
    for key, lab in snapped.items():
        img = cv2.imread(str(WORK / f'{key}.src.jpg'))
        if img is None:
            continue
        H = np.array(lab['H'], np.float64).reshape(3, 3)
        lines = lab['lines']  # [[x0,y0,x1,y1], ...] fret lines 0..12, from the TS side
        for n, (x0, y0, x1, y1) in enumerate(lines):
            cv2.line(img, (int(x0), int(y0)), (int(x1), int(y1)), (0, 220, 255), 1, cv2.LINE_AA)
            if n in (1, 3, 5, 7, 9, 12):
                cv2.putText(img, str(n), (int(x1) + 3, int(y1) + 12), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 0), 1)
        for (x0, y0, x1, y1) in lab['strings']:
            cv2.line(img, (int(x0), int(y0)), (int(x1), int(y1)), (255, 0, 255), 1, cv2.LINE_AA)
        crops = []
        for (cx, cy) in lab['crops']:
            x, y = int(cx) - 60, int(cy) - 40
            c = img[max(0, y):y + 80, max(0, x):x + 120]
            if c.size:
                crops.append(cv2.resize(c, (240, 160), interpolation=cv2.INTER_NEAREST))
        out = img
        if crops:
            strip = np.hstack(crops + [np.zeros((160, 240, 3), np.uint8)] * (3 - len(crops)))
            if strip.shape[1] < out.shape[1]:
                strip = np.hstack([strip, np.zeros((160, out.shape[1] - strip.shape[1], 3), np.uint8)])
            out = np.vstack([out, strip[:, : out.shape[1]]])
        cv2.imwrite(str(WORK / f'{key}.review.jpg'), out, [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(f'{len(snapped)} reviews written')


if __name__ == '__main__':
    {'prep': lambda: prep(Path(sys.argv[2])), 'review': review}[sys.argv[1]]()
