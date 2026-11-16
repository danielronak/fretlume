# Phase 7 — Hand vision & fusion (release v0.6 🎸)

**Goal.** The app sees where the fingers are and helps *before* the strum: "ring finger one string
lower". Vision hints and audio verdicts are fused; vision alone never fails the player.
**Read first:** `specs/01-vision.md` §7; `specs/02-audio.md` §4; `specs/05-ux.md` §4; `research/01` (GuiFiR note).
**Sessions:** 2–3.

## Tasks
- [ ] **7.1 Hand runtime:** self-hosted `@mediapipe/tasks-vision` (wasm + `hand_landmarker.task` in
      `public/models`, precached), GPU delegate with CPU fallback, runs in the vision Worker on the neck
      ROI, adaptive rate (every frame → every 3rd by measured cost).
- [ ] **7.2 Finger → cell mapping:** contact-point model, projection with `H⁻¹`, string/fret assignment
      with confidence, barre detection, fretting-hand selection, handedness-aware finger numbering;
      temporal voting (8-frame window).
- [ ] **7.3 Occlusion-aware tracking:** hand hull mask excluded from EdgeTracker evidence; dots under
      fingers drawn as outlines; re-check gate G3.3 with the mask on (must not regress).
- [ ] **7.4 Hints:** compare observed cells with the target shape → at most one hint: nearest wrong
      finger with direction arrows on the neck (toward nut/bridge, up/down a string); "all fingers in
      place ✓ — now strum" cue; hint appears only after 0.5 s of stable disagreement.
- [ ] **7.5 Fusion:** verdict combiner — audio decides pass/fail; vision explains *why* a string is wrong
      (wrong cell vs muted by a neighbouring finger) and pre-validates fingering in fingering-focused
      lessons; disagreements logged for analytics.
- [ ] **7.6 Evaluation:** synthetic clips with the procedural hand give only pipeline correctness.
      Real evaluation: golden clips of fretting hands (Wikimedia, if allowed) labelled by the agent at
      the chord level (which chord is held) → report cell-assignment plausibility; treat as report-only.
      The decisive check is the 🎸 field test.
- [ ] **7.7 Settings:** hand hints on/off (default on if device is fast enough), privacy note.
- [ ] **7.8** Tag `v0.6`, deploy, 🎸 request: "hold C, then move one finger to the wrong string — does the
      hint point the right way?"

## Acceptance (exit gate)
| ID | Gate |
|---|---|
| G7.1 | Pipeline test on procedural-hand clips: fingertip cell assignment ≥ 90 % |
| G7.2 | Tracking gate G3.3 holds with hands present and mask enabled |
| G7.3 | Hint precision in scripted wrong-finger clips ≥ 90 %, false hints on correct grips ≤ 5 % (synthetic) |
| G7.4 | Hand pipeline adds ≤ 1 frame of latency to the overlay (async; overlay never waits for hands) |
Model + wasm add ≤ 14 MB; offline test green.

## Fallback ladder
- MediaPipe unreliable on real fretting hands (owner field test) → restrict to coarse cues that it does
  well: hand *position along the neck* ("you are two frets too high"), finger count/barre presence;
  keep per-finger hints behind an "experimental" toggle.
- Too slow on the owner's device → hands at 5 Hz, hints only while the player is paused on a step.
