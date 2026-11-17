"""NeckNet losses (docs/specs/01-vision.md §8): focal heatmaps, L1 offsets, BCE mask/presence, CE profile."""
from __future__ import annotations

import torch
import torch.nn.functional as F


def focal(logits: torch.Tensor, target: torch.Tensor, weight: torch.Tensor) -> torch.Tensor:
    """CenterNet penalty-reduced focal loss; `weight` (B,4) scales each corner's map."""
    p = torch.sigmoid(logits).clamp(1e-4, 1 - 1e-4)
    pos = target.eq(1).float()
    neg = 1 - pos
    pos_loss = -torch.log(p) * (1 - p) ** 2 * pos
    neg_loss = -torch.log(1 - p) * p**2 * (1 - target) ** 4 * neg
    w = weight[..., None, None]
    n = (pos * w).sum().clamp(min=1)
    return ((pos_loss + neg_loss) * w).sum() / n


def gather_offsets(pred: torch.Tensor, cells: torch.Tensor) -> torch.Tensor:
    """pred (B,8,H,W) → (B,4,2) at each corner's peak cell."""
    b = torch.arange(pred.shape[0])[:, None]
    k = torch.arange(4)[None, :]
    iy, ix = cells[..., 0], cells[..., 1]
    dx = pred[b, 2 * k, iy, ix]
    dy = pred[b, 2 * k + 1, iy, ix]
    return torch.stack([dx, dy], -1)


def necknet_loss(head: torch.Tensor, g: torch.Tensor, batch: dict) -> tuple[torch.Tensor, dict]:
    mask_logit, heat_logit, offs = head[:, 0], head[:, 1:5], head[:, 5:13]
    present = batch['presence']
    l_heat = focal(heat_logit, batch['heat'], batch['cw'] * present[:, None])
    po = gather_offsets(offs, batch['cells'])
    w = (batch['cw'] * present[:, None])[..., None]
    l_off = (F.l1_loss(po, batch['offs'], reduction='none') * w).sum() / w.sum().clamp(min=1)
    l_mask = F.binary_cross_entropy_with_logits(mask_logit, batch['mask'])
    l_pres = F.binary_cross_entropy_with_logits(g[:, 0], present)
    if present.sum() > 0:
        sel = present > 0
        l_orient = F.binary_cross_entropy_with_logits(g[sel, 1], batch['orientation'][sel])
        l_prof = F.cross_entropy(g[sel, 2:5], batch['profile'][sel])
    else:
        l_orient = l_prof = head.sum() * 0
    total = l_heat + l_off + l_mask + l_pres + 0.5 * l_orient + 0.3 * l_prof
    return total, {'heat': l_heat.item(), 'off': l_off.item(), 'mask': l_mask.item(), 'pres': l_pres.item(),
                   'orient': l_orient.item(), 'prof': l_prof.item()}
