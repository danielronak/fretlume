# Phase 3 — Camera overlay with manual lock (release v0.2 🎸)

**Goal.** The core magic, with zero machine learning: the player taps four points once, and the overlay
stays glued to the real neck while they play. This phase alone delivers the reference app's headline
feature with an always-works lock.
**Read first:** `specs/01-vision.md` §1–§6, §9; `research/02-spike-results.md` §S4;
`spikes/edge_tracker/proto.py` (port source); `specs/05-ux.md` §3–§5; `specs/06` §2.
**Sessions:** 3–4.

## Tasks
- [x] **3.1 Synthetic generator v1** (`ml/synth`): port and extend the spike renderer — instrument
      profiles, ≥ 4 board families, inlays, nut, strings, body/headstock, procedural torso + room,
      capsule-finger hand occluder, camera effects, **sequences** with smooth pose trajectories; exact
      labels. `npm run fixtures` emits the e2e clips listed in `specs/06` §2 with label JSON.
- [x] **3.2 Geometry kernel** (`vision/geometry.ts`): homography from 4 points, weighted DLT with Hartley
      normalisation, inverse, projection, control-point ↔ `H`, local Jacobian (for ellipse dots), 1-D
      projective map from 3 pairs. Unit + property tests; numeric parity with the Python reference.
- [x] **3.3 EdgeTracker port** (`vision/edgeTracker.ts`): strip rectification (bilinear, typed arrays),
      evidence filters, comb search, per-fret refinement, fret-end cue, IRLS. Cross-check against
      `proto.py` on 200 seeded frames exported from Python (gate **G3.1**).
- [x] **3.4 Tracker improvements:** half-resolution pyramid pass, string-ridge across cue, wire polarity
      detection, out-of-frame masking, multi-start wrapper, confidence calibration (gate **G3.2**).
- [x] **3.5 Camera pipeline:** device selection, 1280×720 preferred, `requestVideoFrameCallback`,
      frame → Worker (transfer `VideoFrame`/`ImageBitmap`), grayscale extraction, pose messages back with
      capture timestamps; quality tiers (process at 720p / 540p / 360p-strip-only).
- [x] **3.6 Tracking loop + filter:** state machine (spec §3) for manual lock; constant-velocity
      prediction; One-Euro filter on control points; RECOVERING with wide ranges; index never changes
      (gates **G3.3**, **G3.4**, **G3.5**).
- [x] **3.7 Manual lock UI:** freeze frame, four handles with loupe, live grid preview, snap with
      multi-start tracker, confirmation with fret numbers and ◄ shift ► (spec 01 §5–§6); remember taps.
- [x] **3.8 Overlay renderer:** marks → projected ellipses with labels and colours; open/muted markers;
      overlay size control; mirror and string-flip; fade on low confidence; draws the same `Shape` the flat
      diagram draws.
- [x] **3.9 Stage screen + deck:** full-bleed video, status pill, deck (title, mini diagram,
      Start/Restart/Loop/Back/Next, auto-advance seconds, one-shape/all), Re-lock, Flip, Full screen, End;
      "Open on my guitar" from any library item; wake lock.
- [x] **3.10 Bench + e2e:** `npm run bench:vision` (G3.x → `docs/benchmarks/vision-phase3.json`);
      e2e: scripted taps at the labelled corners (with ±6 px noise) on the `lock-easy` clip → overlay dots
      land within tolerance of labelled cells on sampled frames of `track-hand` and `track-motion`
      (read the overlay's projected positions through a test hook, compare with labels).
- [x] **3.11 Field-test checklist** screen (`Settings → Field test`) and the diagnostics exporter skeleton
      (pose logs + optional frames, `specs/06` §4). Tag `v0.2`, deploy, post the 🎸 request, keep working.

## Result (2026-11-17) — released as 0.2.0 with three gates failing, recorded
| Gate | Result |
|---|---|
| G3.1 TS vs Python reference | Pass on the current frames: success 27.5/30.5 % (σ 2), 11.5/13 % (σ 5), 6/6 % (σ 8); case agreement ≥ 96 %; median along ≤ 0.015 fret. |
| G3.3 tracking, 60 clips with motion and a hand | Frames good 98.2 % (pass); 1 clip slips the index (gate 0, **fail**; D-017). |
| G3.4 jitter, 12 static clips | 1.05 px RMS (gate 0.7, **fail**; one clip's nut near the image edge scatters ±6 px; 10 of 12 clips below 0.7; D-017). |
| G3.5 tracker cost | 0.29 M pixel samples per frame (budget 2.0 M, pass); 50 ms per frame in this container after the D-018 speed-ups (was 88). |
| E2E lock + tracking on fixture clips | Pass: `stage.spec.ts` — lock-easy (±6 px taps → verified lock, dots within 2.5 mm), track-hand, track-motion, lefty, capo, low-light (dots within 3 mm on ≥ 80 % of samples), no-guitar (never shown as verified); 60 of 60 e2e tests. Clip choices in D-018. |
| Screens | 15 screenshots (12 clips/items, confirm and marking views, light theme, phone landscape) in `docs/screens/phase-3/`, reviewed via `contact-sheet.jpg`: grids and fret numbers on the right frets, dots on strings behind the frets, root rings visible. |
| G3.2 lock basin (held-out frames) | **Fail at σ 5**: 4 taps 91.5 % (σ 5), 86.5 % (σ 8); 6 taps 91.5 % / 91.5 %. Fallback steps 2 and 3 taken (D-016): optional 5th-fret taps, remainder carried to Phase 4. |

## Acceptance (exit gate)
Gates **G3.1–G3.5** pass (numbers recorded); e2e lock + tracking tests pass on all fixture clips incl.
lefty and capo; visual inspection of ≥ 12 overlay screenshots across clips saved to
`docs/screens/phase-3/` — dots on the correct string between the correct frets, root ring visible.

## Fallback ladder (if G3.2 basin gate fails)
1. Tune ranges/pyramid; add inlay-centre cue; add neck-edge (board vs background) cue at pyramid level 0.
2. Require a tighter manual lock: add 2 optional taps (5th-fret corners) → 6-point fit.
3. Accept a lower σ = 8 px gate (≥ 80 %) for now and carry the remainder to Phase 4 (StripNet); manual
   lock with the loupe typically gives σ ≤ 4 px, where success is already ≥ 97 %.
If G3.3 (tracking under a hand) fails: weight the unoccluded half of each fret, increase temporal prior
(reject per-frame pose changes above a physical speed limit), hold-and-fade instead of chasing.
