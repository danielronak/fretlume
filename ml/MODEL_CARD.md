# NeckNet v1 — model card

**What it does.** Finds a guitar neck in a camera frame and predicts the four fretboard corners used to lock
the overlay (nut bass, nut treble, 12th-fret treble, 12th-fret bass), plus whether a neck is in view, which
side the headstock is on, and the guitar type (steel-string acoustic, electric, classical). It only gives
the starting point: the EdgeTracker then fits the frets, the index check confirms which fret is which, and
the player confirms the grid (docs/specs/01-vision.md §6, §8).

**Where it runs.** In the browser, in a worker, on Fretlume's own small runtime (`app/src/vision/nn.ts`,
DECISIONS D-019). Only while looking for the neck, a few times a second. Nothing leaves the device.

| | |
|---|---|
| Input | 288×160 colour frame (B, G, R, values 0–1); 16:9 frames fill it, others are letterboxed |
| Architecture | MobileNet-style encoder (inverted residual blocks, ReLU6) + stride-4 decoder; 0.51 M parameters, 148 M multiply-adds |
| Outputs | fretboard mask, 4 corner heatmaps + sub-cell offsets at 72×40; presence, orientation, guitar type |
| File | `app/public/models/necknet-v1.{json,bin}`, fp16, ≈ 1 MB |
| Training | ml/train (PyTorch, CPU), AdamW, cosine schedule, EMA weights; focal heatmap + L1 offset + BCE mask/presence + CE type losses |

## Data
Synthetic only (ml/synth, generator v2, DECISIONS D-020): procedurally drawn guitars (rosewood, ebony, maple,
richlite boards; dot, offset-dot, block and no inlays; bone/black/brass nuts; acoustic, electric and classical
bodies and headstocks; capos, binding, wear, glare), players' torsos and clothing, a fretting hand on 30 % of
frames, rooms with clutter and fret-like distractors (blinds, ladders, keyboards), camera effects (exposure,
white balance, defocus, noise, vignetting, JPEG), framing from 40 to 110 % of the frame width, roll ±35°,
perspective, mirrored or not. 300 000 training frames, 12 % without a guitar.

**Corner convention.** Bass and treble cannot be told apart at this resolution, so the bass corners are
defined as the upper ones (a player's thick string faces up, mirrored or not); the app uses the same rule.

## Evaluation
Median corner error, scaled to a 1280×720 frame; presence AUC over frames with and without a guitar.
`docs/benchmarks/necknet-phase4.json` holds the latest numbers (written by `python -m train.bench`).

*(Final numbers are added when training completes; step 5774: val-A 4.1 px, val-B 3.5 px, val-C 4.1 px, presence AUC 1.0.)*

## Limits
- Trained on drawings, not photographs. The real-photo golden set (gate G4.4) is the honest check of how it
  does on real guitars; until it is measured, automatic lock is labelled beta and always asks the player to
  confirm the grid.
- A hand over the 12th fret can pull that corner off; the auto-lock multi-start and the player's
  confirmation catch most of these.
- Light (maple) boards are the weakest case for the fret fit that follows (Phase 3, D-016).
- Bass/treble comes from the convention above, not from the image.
