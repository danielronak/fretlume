"""Shard reader and target construction for NeckNet training."""
from __future__ import annotations

import glob
import random

import cv2
import numpy as np
import torch
from torch.utils.data import IterableDataset, get_worker_info

from .model import IN_H, IN_W, STRIDE

GH, GW = IN_H // STRIDE, IN_W // STRIDE
SIGMA = 1.5  # heatmap Gaussian, cells


def load(path: str) -> dict:
    with np.load(path) as z:
        return {k: z[k] for k in z.files}


def decode(shard: dict, i: int) -> np.ndarray:
    a, b = shard['offsets'][i], shard['offsets'][i + 1]
    return cv2.imdecode(shard['jpeg'][a:b], cv2.IMREAD_COLOR)


def targets(cps: np.ndarray, presence: int, flip: bool):
    """Heatmaps (4,GH,GW), offsets (4,2), peak cells (4,2) int, weights (4,) per corner."""
    heat = np.zeros((4, GH, GW), np.float32)
    offs = np.zeros((4, 2), np.float32)
    cells = np.zeros((4, 2), np.int64)
    weights = np.zeros(4, np.float32)
    if not presence:
        return heat, offs, cells, weights
    ys, xs = np.mgrid[0:GH, 0:GW].astype(np.float32)
    for k in range(4):
        x, y = cps[k] / STRIDE
        if flip:
            x = GW - x
        inside = 0 <= x < GW and 0 <= y < GH
        # Out-of-frame corners are still supervised at the nearest edge cell, with less weight.
        cx = float(np.clip(x, 0, GW - 1e-3))
        cy = float(np.clip(y, 0, GH - 1e-3))
        weights[k] = 1.0 if inside else 0.3
        heat[k] = np.exp(-((xs - cx + 0.5) ** 2 + (ys - cy + 0.5) ** 2) / (2 * SIGMA**2))
        ix, iy = int(cx), int(cy)
        heat[k, iy, ix] = 1.0
        cells[k] = (iy, ix)
        offs[k] = (cx - ix, cy - iy)
    return heat, offs, cells, weights


def sample(shard: dict, i: int, augment: bool) -> dict:
    img = decode(shard, i)
    flip = augment and random.random() < 0.5
    if flip:
        img = img[:, ::-1]
    x = img.astype(np.float32) / 255.0
    if augment:  # brightness / contrast / colour jitter on top of the generator's
        x = (x - 0.5) * random.uniform(0.8, 1.2) + 0.5 + random.uniform(-0.08, 0.08)
        x *= np.array([random.uniform(0.92, 1.08) for _ in range(3)], np.float32)
        x = np.clip(x, 0, 1)
    presence = int(shard['presence'][i])
    heat, offs, cells, weights = targets(shard['cps'][i], presence, flip)
    mask = shard['mask'][i][:, ::-1] if flip else shard['mask'][i]
    orient = int(shard['orientation'][i])
    if flip:
        orient = 1 - orient
    return {
        'image': torch.from_numpy(np.ascontiguousarray(x.transpose(2, 0, 1))),
        'heat': torch.from_numpy(heat), 'offs': torch.from_numpy(offs), 'cells': torch.from_numpy(cells),
        'cw': torch.from_numpy(weights), 'mask': torch.from_numpy(np.ascontiguousarray(mask).astype(np.float32)),
        'presence': torch.tensor(float(presence)), 'orientation': torch.tensor(float(orient)),
        'profile': torch.tensor(int(shard['profile'][i])),
        'cps': torch.from_numpy(shard['cps'][i] * np.array([-1, 1], np.float32) + np.array([IN_W, 0], np.float32)
                                if flip else shard['cps'][i]),
    }


class ShardStream(IterableDataset):
    """Endless shuffled stream over shards (train) or one pass in order (eval)."""

    def __init__(self, pattern: str, augment: bool, endless: bool, seed: int = 0):
        self.files = sorted(glob.glob(pattern))
        assert self.files, pattern
        self.augment, self.endless, self.seed = augment, endless, seed

    def __iter__(self):
        info = get_worker_info()
        wid, nw = (info.id, info.num_workers) if info else (0, 1)
        rng = random.Random(self.seed + wid)
        files = self.files[wid::nw]
        while True:
            order = files[:]
            if self.endless:
                rng.shuffle(order)
            for f in order:
                shard = load(f)
                idx = list(range(len(shard['offsets']) - 1))
                if self.endless:
                    rng.shuffle(idx)
                for i in idx:
                    yield sample(shard, i, self.augment)
            if not self.endless:
                return
