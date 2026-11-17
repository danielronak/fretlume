"""NeckNet gates G4.1 / G4.2 (docs/specs/01-vision.md §9) → docs/benchmarks/necknet-phase4.json.

  uv run --group train python -m train.bench --ckpt checkpoints/necknet-ema.pt
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch

from .evaluate import evaluate
from .model import NeckNet

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--ckpt', default=str(ROOT / 'checkpoints' / 'necknet-ema.pt'))
    ap.add_argument('--data', default=str(ROOT / 'data'))
    ap.add_argument('--out', default=str(ROOT.parent / 'docs' / 'benchmarks' / 'necknet-phase4.json'))
    ap.add_argument('--limit', type=int, default=4096)
    args = ap.parse_args()
    torch.set_num_threads(4)
    state = torch.load(args.ckpt, map_location='cpu')
    model = NeckNet()
    model.load_state_dict(state['ema'])
    results = {'step': state.get('step'), 'checkpoint': Path(args.ckpt).name}
    for split in ['val-a', 'val-b', 'val-c']:
        if list(Path(args.data, split).glob('*.npz')):
            results[split] = evaluate(model, f'{args.data}/{split}/*.npz', limit=args.limit)
    b, c = results.get('val-b', {}), results.get('val-c', {})
    results['gates'] = {
        'G4.1': {'rule': 'val-B median corner error ≤ 6 px at 720p and presence AUC ≥ 0.99',
                 'pass': bool(b and b['median_px_720p'] <= 6 and b['presence_auc'] >= 0.99)},
        'G4.2': {'rule': 'val-C (photo-composite style) median corner error ≤ 9 px at 720p',
                 'pass': bool(c and c['median_px_720p'] <= 9)},
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results, indent=1))


if __name__ == '__main__':
    main()
