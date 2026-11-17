"""Train NeckNet in resumable, time-boxed chunks (phase 4 task 4.3).

  uv run --group train python -m train.train --minutes 95

Resumes from ml/checkpoints/latest.pt when it exists; saves every 10 minutes and at the end; appends
progress and evaluations to ml/checkpoints/log.jsonl.
"""
from __future__ import annotations

import argparse
import copy
import json
import math
import time
from pathlib import Path

import torch

from .data import ShardStream
from .evaluate import evaluate
from .losses import necknet_loss
from .model import NeckNet

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--minutes', type=float, default=95)
    ap.add_argument('--batch', type=int, default=48)
    ap.add_argument('--total-samples', type=int, default=900_000)
    ap.add_argument('--lr', type=float, default=2e-3)
    ap.add_argument('--data', default=str(ROOT / 'data'))
    ap.add_argument('--ckpt', default=str(ROOT / 'checkpoints' / 'latest.pt'))
    ap.add_argument('--eval-every', type=int, default=2000, help='steps')
    ap.add_argument('--workers', type=int, default=1)
    ap.add_argument('--threads', type=int, default=3)
    args = ap.parse_args()
    torch.set_num_threads(args.threads)
    ckpt = Path(args.ckpt)
    ckpt.parent.mkdir(parents=True, exist_ok=True)
    log = ckpt.parent / 'log.jsonl'

    model = NeckNet()
    ema = copy.deepcopy(model)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    total_steps = args.total_samples // args.batch
    step = 0
    if ckpt.exists():
        state = torch.load(ckpt, map_location='cpu')
        model.load_state_dict(state['model'])
        ema.load_state_dict(state['ema'])
        opt.load_state_dict(state['opt'])
        step = state['step']
        print(f'resumed at step {step}', flush=True)
    for p in ema.parameters():
        p.requires_grad_(False)

    def lr_at(s: int) -> float:
        warm = 500
        if s < warm:
            return args.lr * (s + 1) / warm
        return args.lr * 0.5 * (1 + math.cos(math.pi * min(1.0, (s - warm) / max(1, total_steps - warm))))

    def save() -> None:
        tmp = ckpt.with_suffix('.tmp')
        torch.save({'model': model.state_dict(), 'ema': ema.state_dict(), 'opt': opt.state_dict(), 'step': step,
                    'args': vars(args)}, tmp)
        tmp.replace(ckpt)
        # A small EMA-only copy for export and for committing.
        torch.save({'ema': ema.state_dict(), 'step': step}, ckpt.parent / 'necknet-ema.pt')

    stream = ShardStream(f'{args.data}/train/*.npz', augment=True, endless=True, seed=step)
    loader = torch.utils.data.DataLoader(stream, batch_size=args.batch, num_workers=args.workers,
                                         persistent_workers=args.workers > 0)
    t0 = time.time()
    last_save = t0
    running: dict[str, float] = {}
    model.train()
    for batch in loader:
        if step >= total_steps or time.time() - t0 > args.minutes * 60:
            break
        for g in opt.param_groups:
            g['lr'] = lr_at(step)
        head, glob_ = model(batch['image'])
        loss, parts = necknet_loss(head, glob_, batch)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
        opt.step()
        with torch.no_grad():
            d = min(0.999, (1 + step) / (10 + step))
            for pe, pm in zip(ema.parameters(), model.parameters()):
                pe.mul_(d).add_(pm, alpha=1 - d)
            for be, bm in zip(ema.buffers(), model.buffers()):
                be.copy_(bm)
        step += 1
        for k, v in {'loss': loss.item(), **parts}.items():
            running[k] = 0.98 * running.get(k, v) + 0.02 * v
        if step % 100 == 0:
            rate = step * args.batch / max(1, time.time() - t0) if step < 200 else None
            print(json.dumps({'step': step, 'lr': round(lr_at(step), 6), **{k: round(v, 4) for k, v in running.items()},
                              'elapsed_min': round((time.time() - t0) / 60, 1)}), flush=True)
            del rate
        if step % args.eval_every == 0:
            result = {'step': step, 'samples': step * args.batch,
                      'val-a': evaluate(ema, f'{args.data}/val-a/*.npz', limit=1024),
                      'val-b': evaluate(ema, f'{args.data}/val-b/*.npz', limit=1024)}
            with log.open('a') as f:
                f.write(json.dumps(result) + '\n')
            print(json.dumps(result), flush=True)
        if time.time() - last_save > 600:
            save()
            last_save = time.time()
    save()
    print(f'chunk done at step {step}/{total_steps}', flush=True)


if __name__ == '__main__':
    main()
