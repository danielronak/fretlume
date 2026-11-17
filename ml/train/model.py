"""NeckNet (docs/specs/01-vision.md §8): a small MobileNet-style encoder with a stride-4 decoder.

Only operations the browser engine implements (app/src/vision/nn.ts): 3×3 and 1×1 convolutions
(grouped = depthwise), batch norm (folded at export), ReLU6, add, nearest ×2 upsampling, global
average pooling and a linear layer.
"""
from __future__ import annotations

import torch
from torch import nn
import torch.nn.functional as F

IN_H, IN_W = 160, 288
STRIDE = 4
HEAD_CHANNELS = 1 + 4 + 8  # mask, 4 heatmaps, 4×(dx, dy)
GLOBAL_OUT = 1 + 1 + 3  # presence, orientation (headstock right), profile


def conv_bn(cin: int, cout: int, k: int = 1, s: int = 1, groups: int = 1, act: bool = True) -> nn.Sequential:
    layers: list[nn.Module] = [nn.Conv2d(cin, cout, k, s, k // 2, groups=groups, bias=False), nn.BatchNorm2d(cout)]
    if act:
        layers.append(nn.ReLU6(inplace=True))
    return nn.Sequential(*layers)


class InvertedResidual(nn.Module):
    def __init__(self, cin: int, cout: int, stride: int, expand: int):
        super().__init__()
        mid = cin * expand
        self.use_res = stride == 1 and cin == cout
        layers = []
        if expand != 1:
            layers.append(conv_bn(cin, mid, 1))
        layers += [conv_bn(mid, mid, 3, stride, groups=mid), conv_bn(mid, cout, 1, act=False)]
        self.block = nn.Sequential(*layers)

    def forward(self, x):
        y = self.block(x)
        return x + y if self.use_res else y


# (expand, out channels, repeats, first stride)
ENCODER = [(1, 16, 1, 1), (4, 24, 2, 2), (4, 32, 3, 2), (4, 64, 3, 2), (4, 96, 2, 1), (4, 128, 2, 2)]


class Refine(nn.Module):
    """Depthwise 3×3 + pointwise 1×1 after merging a skip connection."""

    def __init__(self, c: int):
        super().__init__()
        self.dw = conv_bn(c, c, 3, groups=c)
        self.pw = conv_bn(c, c, 1)

    def forward(self, x):
        return self.pw(self.dw(x))


class NeckNet(nn.Module):
    def __init__(self, width: int = 64):
        super().__init__()
        self.stem = conv_bn(3, 16, 3, 2)
        stages = []
        cin = 16
        for t, c, n, s in ENCODER:
            blocks = []
            for i in range(n):
                blocks.append(InvertedResidual(cin, c, s if i == 0 else 1, t))
                cin = c
            stages.append(nn.Sequential(*blocks))
        self.stages = nn.ModuleList(stages)
        # Skips at stride 4 (stage 1, 24 ch), 8 (stage 2, 32), 16 (stage 4, 96), 32 (stage 5, 128).
        self.lat32 = conv_bn(128, width, 1)
        self.lat16 = conv_bn(96, width, 1)
        self.lat8 = conv_bn(32, width, 1)
        self.lat4 = conv_bn(24, width, 1)
        self.ref16, self.ref8, self.ref4 = Refine(width), Refine(width), Refine(width)
        self.head = nn.Conv2d(width, HEAD_CHANNELS, 1)
        with torch.no_grad():  # heatmaps start near p = 0.01 (CenterNet prior), offsets near 0.5
            self.head.bias[1:5].fill_(-4.6)
            self.head.bias[5:13].fill_(0.5)
        self.globals = nn.Linear(128, GLOBAL_OUT)

    def forward(self, x):
        x = self.stem(x)
        feats = []
        for stage in self.stages:
            x = stage(x)
            feats.append(x)
        f4, f8, f16, f32 = feats[1], feats[2], feats[4], feats[5]
        up = lambda t: F.interpolate(t, scale_factor=2, mode='nearest')  # noqa: E731
        y = self.lat32(f32)
        y = self.ref16(up(y)[..., : f16.shape[2], : f16.shape[3]] + self.lat16(f16))
        y = self.ref8(up(y)[..., : f8.shape[2], : f8.shape[3]] + self.lat8(f8))
        y = self.ref4(up(y)[..., : f4.shape[2], : f4.shape[3]] + self.lat4(f4))
        head = self.head(y)
        g = self.globals(f32.mean(dim=(2, 3)))
        return head, g


def count_params(m: nn.Module) -> int:
    return sum(p.numel() for p in m.parameters())


if __name__ == '__main__':
    m = NeckNet()
    head, g = m(torch.zeros(1, 3, IN_H, IN_W))
    print('params', count_params(m), 'head', tuple(head.shape), 'globals', tuple(g.shape))
