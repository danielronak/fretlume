# Phase 4 — Synthetic data engine & automatic lock (release v0.3 🎸)

**Goal.** Point the camera at the guitar and the board locks by itself in under two seconds — trained
only on generated data, verified honestly, with manual lock as the safety net.
**Read first:** `specs/01-vision.md` §5, §6, §8, §9; `specs/06-testing-and-data.md` §2–§4;
`research/02-spike-results.md` §S3–S4.
**Sessions:** 4–6 (includes training time).

## Tasks
- [x] **4.1 Generator v2.** Full appearance/camera randomisation of `specs/06` §2: all board/inlay/nut/
      string families, headstocks, bodies, capo, torso/clothing/room, lighting, artefacts; hand present in
      30 % of frames; negatives. Throughput target ≥ 60 frames/s on 4 cores at 288×160 (render small
      directly; do not render 720p and downscale). Splits train / val-A / val-B / negatives.
      **Visual audit:** export a 10×10 contact sheet per family and inspect it; fix anything that looks
      unlike a guitar before training.
- [x] **4.2 (Optional) 3-D val-C.** *(Replaced by the photo-composite val-C, D-020.)* Try `uv` + Python 3.11 + `bpy`; parametric guitar; 300 Cycles renders
      with labels. If installation or render time (> 30 s/frame) fails, replace val-C with photo-composite
      frames (generator foreground over real-looking procedural rooms with stronger lighting model) and
      note it in `DECISIONS.md`.
- [x] **4.3 NeckNet model + training** (`ml/train`): architecture and losses per spec §8; on-the-fly
      data from the generator with worker processes; AdamW + cosine; EMA weights; mixed splits eval every
      N steps; **checkpoint every 10 minutes**, auto-resume; run as background chunks ≤ 100 min
      (`ml/train/run_chunk.sh`), commit `ml/checkpoints/latest.pt` (< 15 MB) after each chunk.
      Alternative path: `train.yml` on GitHub Actions (specs/06 §6).
- [x] **4.4 Export.** ONNX (+ fp16 if parity holds), simplify, numeric parity Python ↔ onnxruntime ↔
      onnxruntime-web (Playwright test). Model card `ml/MODEL_CARD.md` (data, metrics, limits).
- [x] **4.5 Decoder** (`vision/neckNet.ts`): letterbox, run, decode heatmap peaks + offsets → control
      points, presence, orientation, profile; map back to full-frame pixels. Gates **G4.1**, **G4.2**.
- [x] **4.6 Auto-lock integration:** SEARCHING loop at 3–5 Hz → candidate → multi-start EdgeTracker →
      index verification (nut evidence + inlay template for shifts −2…+2) → VERIFYING 5 frames → LOCKED;
      false-lock guards (presence, tracker score, temporal consistency). Gate **G4.3**.
- [ ] **4.7 (Conditional) StripNet** *(Not attempted yet, D-021.)* — only if G4.3 fails after tuning multi-start and pyramid ranges:
      tiny CNN on the rectified strip (spec §8), same training infrastructure.
- [ ] **4.8 Guitar profile.** *(Partly: the Stage suggests the detected guitar type; taper refinement and per-guitar memory are not done.)* Detected profile suggestion (acoustic/electric/classical) the user can
      override; taper + string-spread refinement after lock; per-guitar memory (inlay signature, wire
      polarity, fret count, index) keyed by a user-named guitar.
- [ ] **4.9 Real golden set.** *(Hosts approved by the owner; the first download was refused by the session's permission check — G4.4 not measured, D-021.)* Propose allowlisting `commons.wikimedia.org` + `upload.wikimedia.org`
      (state the reason); collect and label ≥ 60 frames with `tools/golden` (specs/06 §3); gate **G4.4**
      reported. If the owner declines the hosts: mark G4.4 "not measured", ship auto-lock as beta.
- [x] **4.10 UX.** SEARCHING tips driven by diagnosis (too dark → "More light"; neck cut off → arrow
      toward the missing end; hand on neck → "Lift your hand for a second"); VERIFYING confirmation;
      auto-lock toggle; never a silent wrong lock.
- [ ] **4.11** Bench JSON, screenshots (`docs/screens/phase-4/`), tag `v0.3`, deploy, 🎸 request with the
      specific question "did it lock on your guitar, and were the fret numbers right?".

## Result (2026-11-17) — released as 0.3.0 with auto-lock as an opt-in beta
| Gate | Result |
|---|---|
| G4.1 NeckNet on val-B (held-out families) | Pass: median 3.3 px at 720p (≤ 6), presence AUC 1.0 (≥ 0.99). |
| G4.2 NeckNet on val-C (photo-composite instead of 3-D, D-020) | Pass: median 3.9 px (≤ 9). |
| G4.3 end-to-end auto-lock (single-frame proxy, 200 + 200 frames) | **Fail**: 85 % correct (≥ 95), 3 % wrong index (≤ 1), 0 % false locks (≤ 0.5). Fallback step 3: manual lock default, auto-lock opt-in beta (D-021). |
| G4.4 real golden set | **Not measured** (download refused in-session; D-021). |
| Bundle | Model 1 MB, runtime ≈ 10 kB (budget 12 MB). `offline.spec.ts` green. |
| e2e `autolock.spec.ts` | Pass on lock-easy, lock-hard, lefty, capo, low-light; never locks on no-guitar. |
| Index verification (new) | 97.2 % right over shifts −2…+2 on held-out frames (D-020). |
| Screens | `docs/screens/phase-4/` (searching tip, verifying grid, confirm, overlay, no-guitar, phone). |

## Acceptance (exit gate)
G4.1, G4.2, G4.3 pass; G4.4 measured and reported (≥ 85 % or auto-lock labelled beta with the measured
number); model + runtimes add ≤ 12 MB to the bundle; `offline.spec.ts` still green; e2e `lock-auto`
passes on easy/hard/lefty/capo/low-light clips and **does not lock** on the no-guitar clip.

## Fallback ladder
1. Sim-to-real gap (G4.4 < 85 %): inspect failures as images → add the missing appearance factor to the
   generator → retrain (budget: 3 iterations). Prioritise clothing/torso clutter, glare on frets,
   perspective extremes, light boards.
2. Still failing: assisted lock — the user taps **one** point on the nut and one near the 12th fret
   (2 taps), NeckNet/EdgeTracker do the rest.
3. Still failing: keep 4-tap manual as the default path, auto-lock opt-in "experimental". The product
   remains fully functional; continue with Phase 5.
Training too slow: reduce input to 224×128, shrink decoder, or move to `train.yml`.
