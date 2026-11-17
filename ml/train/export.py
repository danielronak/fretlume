"""Export NeckNet for the browser engine (app/src/vision/nn.ts), phase 4 task 4.4.

Writes <out>.bin (fp16 weights, BatchNorm folded into the convolutions) and <out>.json (the ops in
execution order), plus <out>.parity.json: outputs for a deterministic input, for the parity test.

  uv run --group train python -m train.export --ckpt checkpoints/necknet-ema.pt --out ../app/public/models/necknet
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from torch import nn

from .model import IN_H, IN_W, InvertedResidual, NeckNet, Refine


class Writer:
    def __init__(self):
        self.chunks: list[np.ndarray] = []
        self.offset = 0
        self.ops: list[dict] = []
        self.n = 0

    def tensor(self, a: np.ndarray) -> int:
        """Append fp16 data; returns its offset in elements."""
        a = a.astype(np.float16).ravel()
        off = self.offset
        self.chunks.append(a)
        self.offset += a.size
        return off

    def name(self) -> str:
        self.n += 1
        return f't{self.n}'

    def conv(self, seq: nn.Sequential, src: str) -> str:
        conv: nn.Conv2d = seq[0]
        bn: nn.BatchNorm2d = seq[1]
        relu = len(seq) > 2
        scale = (bn.weight / torch.sqrt(bn.running_var + bn.eps)).detach()
        w = (conv.weight.detach() * scale[:, None, None, None]).numpy()
        b = (bn.bias.detach() - bn.running_mean * scale).numpy()
        out = self.name()
        self.ops.append({'op': 'conv', 'in': src, 'out': out, 'cin': conv.in_channels, 'cout': conv.out_channels,
                         'k': conv.kernel_size[0], 'stride': conv.stride[0], 'groups': conv.groups, 'relu6': relu,
                         'w': self.tensor(w), 'b': self.tensor(b)})
        return out

    def head(self, conv: nn.Conv2d, src: str) -> str:
        out = self.name()
        self.ops.append({'op': 'conv', 'in': src, 'out': out, 'cin': conv.in_channels, 'cout': conv.out_channels,
                         'k': 1, 'stride': 1, 'groups': 1, 'relu6': False,
                         'w': self.tensor(conv.weight.detach().numpy()), 'b': self.tensor(conv.bias.detach().numpy())})
        return out

    def add(self, a: str, b: str) -> str:
        out = self.name()
        self.ops.append({'op': 'add', 'a': a, 'b': b, 'out': out})
        return out

    def up2(self, src: str, like: str) -> str:
        out = self.name()
        self.ops.append({'op': 'up2', 'in': src, 'like': like, 'out': out})
        return out


def export(model: NeckNet, out: Path) -> None:
    model.eval()
    w = Writer()
    x = w.conv(model.stem, 'input')
    feats = []
    for stage in model.stages:
        for block in stage:
            assert isinstance(block, InvertedResidual)
            y = x
            for seq in block.block:
                y = w.conv(seq, y)
            x = w.add(x, y) if block.use_res else y
        feats.append(x)
    f4, f8, f16, f32 = feats[1], feats[2], feats[4], feats[5]

    def refine(r: Refine, s: str) -> str:
        return w.conv(r.pw, w.conv(r.dw, s))

    l16, l8, l4 = w.conv(model.lat16, f16), w.conv(model.lat8, f8), w.conv(model.lat4, f4)
    y = w.conv(model.lat32, f32)
    y = refine(model.ref16, w.add(w.up2(y, l16), l16))
    y = refine(model.ref8, w.add(w.up2(y, l8), l8))
    y = refine(model.ref4, w.add(w.up2(y, l4), l4))
    head = w.head(model.head, y)
    g = w.name()
    w.ops.append({'op': 'gap', 'in': f32, 'out': g})
    glob_ = w.name()
    lin: nn.Linear = model.globals
    w.ops.append({'op': 'linear', 'in': g, 'out': glob_, 'cin': lin.in_features, 'cout': lin.out_features,
                  'w': w.tensor(lin.weight.detach().numpy()), 'b': w.tensor(lin.bias.detach().numpy())})
    out.parent.mkdir(parents=True, exist_ok=True)
    np.concatenate(w.chunks).tofile(out.with_suffix('.bin'))
    manifest = {'format': 'fretlume-nn', 'version': 1, 'dtype': 'float16', 'input': [3, IN_H, IN_W],
                'channelOrder': 'BGR', 'outputs': {'head': head, 'globals': glob_}, 'ops': w.ops}
    out.with_suffix('.json').write_text(json.dumps(manifest))
    # Parity vector: the same deterministic input the TS test builds.
    inp = parity_input()
    with torch.no_grad():
        h, gl = model(torch.from_numpy(inp)[None])
    h = h[0].numpy()
    rng = np.random.default_rng(0)
    picks = [(int(c), int(yy), int(xx)) for c, yy, xx in zip(rng.integers(0, h.shape[0], 400),
                                                             rng.integers(0, h.shape[1], 400),
                                                             rng.integers(0, h.shape[2], 400))]
    parity = {'globals': gl[0].tolist(), 'head': [[c, yy, xx, float(h[c, yy, xx])] for c, yy, xx in picks],
              'headPeak': [float(h[c].max()) for c in range(h.shape[0])]}
    out.with_suffix('.parity.json').write_text(json.dumps(parity))
    print(f'wrote {out}.bin ({out.with_suffix(".bin").stat().st_size / 1e6:.2f} MB), {len(w.ops)} ops')


def parity_input() -> np.ndarray:
    """Deterministic test image, channel-major: v = 0.5 + 0.5·sin(0.07·x + 0.11·y + 1.3·c)."""
    c, y, x = np.meshgrid(np.arange(3), np.arange(IN_H), np.arange(IN_W), indexing='ij')
    return (0.5 + 0.5 * np.sin(0.07 * x + 0.11 * y + 1.3 * c)).astype(np.float32)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--ckpt', help='EMA checkpoint; omit for random weights (tests)')
    ap.add_argument('--out', required=True)
    ap.add_argument('--seed', type=int, default=0)
    args = ap.parse_args()
    torch.manual_seed(args.seed)
    model = NeckNet()
    if args.ckpt:
        state = torch.load(args.ckpt, map_location='cpu')
        model.load_state_dict(state['ema'] if 'ema' in state else state)
    else:  # give batch norm non-trivial statistics so folding is exercised
        for m in model.modules():
            if isinstance(m, nn.BatchNorm2d):
                m.running_mean.uniform_(-0.2, 0.2)
                m.running_var.uniform_(0.5, 1.5)
                m.weight.data.uniform_(0.5, 1.5)
                m.bias.data.uniform_(-0.2, 0.2)
    export(model, Path(args.out))


if __name__ == '__main__':
    main()
