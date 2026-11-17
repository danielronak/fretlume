"""NeckNet evaluation: decode corners and report the G4.1/G4.2 metrics."""
from __future__ import annotations

import numpy as np
import torch

from .data import GH, GW, ShardStream
from .model import IN_W, STRIDE

TO_720P = 1280 / IN_W


def decode_corners(head: torch.Tensor) -> torch.Tensor:
    """head (B,13,GH,GW) → corners (B,4,2) in input px: heatmap argmax + sub-cell offset."""
    heat = head[:, 1:5].flatten(2)
    idx = heat.argmax(-1)  # (B,4)
    iy, ix = idx // GW, idx % GW
    b = torch.arange(head.shape[0])[:, None]
    k = torch.arange(4)[None, :]
    dx = head[b, 5 + 2 * k, iy, ix]
    dy = head[b, 6 + 2 * k, iy, ix]
    return torch.stack([(ix + dx) * STRIDE, (iy + dy) * STRIDE], -1)


def auc(scores: np.ndarray, labels: np.ndarray) -> float:
    order = np.argsort(scores)
    ranks = np.empty(len(scores))
    ranks[order] = np.arange(1, len(scores) + 1)
    pos = labels == 1
    n_pos, n_neg = pos.sum(), (~pos).sum()
    if n_pos == 0 or n_neg == 0:
        return float('nan')
    return float((ranks[pos].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


@torch.no_grad()
def evaluate(model: torch.nn.Module, pattern: str, limit: int = 4096, batch: int = 64) -> dict:
    model.eval()
    loader = torch.utils.data.DataLoader(ShardStream(pattern, augment=False, endless=False), batch_size=batch)
    errs, worst, pres, plabel, orient_ok, prof_ok, n_pos = [], [], [], [], 0, 0, 0
    seen = 0
    for b in loader:
        head, g = model(b['image'])
        corners = decode_corners(head)
        p = b['presence'] > 0
        pres.append(torch.sigmoid(g[:, 0]).numpy())
        plabel.append(b['presence'].numpy())
        if p.any():
            gt = b['cps'][p]
            inside = (gt[..., 0] >= 0) & (gt[..., 0] < IN_W) & (gt[..., 1] >= 0) & (gt[..., 1] < GH * STRIDE)
            e = (corners[p] - gt).norm(dim=-1)
            errs.append(e[inside].numpy())
            worst.append(torch.where(inside, e, torch.zeros_like(e)).max(-1).values.numpy())
            orient_ok += ((g[p, 1] > 0).float() == b['orientation'][p]).sum().item()
            prof_ok += (g[p, 2:5].argmax(-1) == b['profile'][p]).sum().item()
            n_pos += int(p.sum())
        seen += len(b['presence'])
        if seen >= limit:
            break
    e = np.concatenate(errs) if errs else np.zeros(1)
    wst = np.concatenate(worst) if worst else np.zeros(1)
    model.train()
    return {
        'frames': seen,
        'median_px_720p': float(np.median(e) * TO_720P),
        'p90_px_720p': float(np.percentile(e, 90) * TO_720P),
        'frames_all_corners_within_12px_720p': float((wst * TO_720P < 12).mean()),
        'presence_auc': auc(np.concatenate(pres), np.concatenate(plabel)),
        'orientation_acc': orient_ok / max(1, n_pos),
        'profile_acc': prof_ok / max(1, n_pos),
    }
