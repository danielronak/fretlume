# Spec 01 — Vision: finding, locking and tracking the neck; hands

Evidence and reference code: `research/02-spike-results.md` §S4 and `spikes/edge_tracker/proto.py`
(the executable specification of §4 — port it, then improve it).

## 1. Coordinate systems
- **Board (metric) frame** `B`: origin at the centre of the nut's fretboard-side edge; `+x` toward the
  bridge along the neck centre line (mm); `+y` toward the treble side (string 1). Fretboard plane `z = 0`.
- **Image frame** `I`: pixels of the *unmirrored* camera frame. Mirroring is a display transform only.
- **Pose** = homography `H: B → I` (3×3, `h33 = 1`). Stored and filtered as the image positions of four
  **control points**: `C0 = (0, −w0/2)`, `C1 = (0, +w0/2)`, `C2 = (x12, +w12/2)`, `C3 = (x12, −w12/2)`
  (nut and 12th-fret corners). Always convert control points ↔ `H` through one function pair.

## 2. Instrument model (`core/guitar`)
```ts
interface InstrumentModel {
  id: string; strings: number;               // 6
  scaleMm: number;                           // 648 electric, 645 acoustic, 650 classical
  frets: number;                             // drawable frets (15 acoustic profile, 22 electric)
  nutWidthMm: number; width12Mm: number;     // 43/52 steel, 42/52 electric, 52/62 classical
  stringSpreadNutMm: number; stringSpreadBridgeMm: number; // outer-string centre distance, e.g. 35 / 52
  inlays: 'dots'|'blocks'|'none'|'unknown';
}
fretX(n)            = scaleMm * (1 - 2 ** (-n / 12))               // n may be fractional
halfWidth(x)        = (nutWidthMm + (width12Mm - nutWidthMm) * x / fretX(12)) / 2
spread(x)           = stringSpreadNutMm + (stringSpreadBridgeMm - stringSpreadNutMm) * x / scaleMm
stringY(s, x)       = spread(x) * ((strings + 1) / 2 - s) / (strings - 1)   // s = 1 → +spread/2, s = 6 → −spread/2
```
String 1 (high e) is at `+y`, string 6 at `−y`, linear between the nut spread and the bridge spread. **Finger target for fret n ≥ 1**: `x = fretX(n − 1) + 0.62 · (fretX(n) − fretX(n − 1))`
(just behind the wire). **Open-string marker**: `x = −9 mm`. Unit-test all of it.
Profiles: `steel-acoustic`, `electric`, `classical`; later `bass-4`, `ukulele`, `7-string`.
The taper (`width12/nutWidth`) and string spreads are refined per guitar after lock (§6).

## 3. Pipeline and state machine
```
SEARCHING ──(NeckNet candidate | manual 4 taps)──► VERIFYING ──(score ≥ τ_lock for 5 frames)──► LOCKED
   ▲                                                   │ fail                                      │
   └───────────────────────────────────────────────────┘                    confidence < τ_low for 0.3 s
LOCKED ──► TRACKING loop:  predict → EdgeTracker(narrow) → filter → publish pose                   │
   ▲                                                                                               ▼
   └──────────── RECOVERING: EdgeTracker(wide, multi-start) from last good pose for ≤ 1.5 s ───────┘
                                  │ still failing → SEARCHING (keep last index + profile as prior)
```
Published per frame: `{ H, controlPoints, confidence 0..1, state, tCaptureMs }`.
UI messages map 1:1 to states (see `05-ux.md` §Stage).

## 4. EdgeTracker (classical, per frame) — the precision engine
Input: grayscale frame, prior `H`, instrument model, optional hand mask. Output: refined `H`, inlier
count, score.
1. **Rectify.** Warp the neck into a strip `SW×SH = 768×128` covering `x ∈ [−14, fretX(N)+6]` mm,
   `y ∈ [−36, 36]` mm using `H`. Bilinear sampling, done in the Worker on a typed array.
2. **Evidence.** Blur σ = 1; `d2 = max(0, −(I(x−3) + I(x+3) − 2 I(x)))` (bright vertical ridges);
   handle dark-on-light boards by also computing the opposite sign and choosing the polarity with the
   stronger comb score at lock time (store it in the guitar profile).
3. **Comb alignment** (iteration 0 only): for the bass and treble halves separately, build the
   median-over-rows column profile, then exhaustively search the displacement of three anchor frets
   (0, 7, 17) — each defines a 1-D projective map — and keep the best comb score.
   Ranges: *wide* (lock/recover) ±0.45 / ±0.9 / ±1.6 local spacings; *narrow* (tracking) ±0.2 / ±0.25 / ±0.3.
   The nut anchor is never allowed to move ≥ 0.5 spacing: that would change the fret index.
4. **Per-fret refinement.** In each half, parabolic sub-pixel peak within ±0.22 spacing; accept if
   `peak > 4 × noise`.
5. **Across cue.** For frets detected in both halves, find where the wire *ends* (inside/outside
   contrast along the column) near `±halfWidth`; these give exact board-edge points.
   Add (Phase 3 improvement) a **string-ridge cue**: horizontal ridges in the strip at `stringY`.
6. **Re-fit.** Weighted DLT (Hartley-normalised) + 4 rounds of Tukey IRLS. Reject if < 12 inliers.
7. Iterate 5× (lock) or 1–2× (tracking).
8. **Confidence** = f(fraction of expected visible frets detected, across-cue count, residual scale).
   Calibrate so that `confidence ≥ 0.6` ⇔ error under (0.25 fret, 0.35 string) on the benchmark.

Required improvements over the prototype (Phase 3, task 3.4): image pyramid (run at ½ strip resolution
first with wide ranges), string-ridge cue, hand-mask exclusion, polarity handling, masked evidence
outside the frame, and a multi-start wrapper (`across ∈ {−7, 0, +7} px` × `rotation ∈ {−3°, 0, +3°}`)
used only for lock/recover.

**Temporal filtering.** One-Euro filter on the 8 control-point coordinates (`minCutoff ≈ 1.2 Hz`,
`beta ≈ 0.02`, tune on the jitter benchmark). Constant-velocity prediction of control points to the
display timestamp (bounded to 50 ms). When `confidence` is low, hold the last pose and fade the overlay
rather than letting it jump.

## 5. Fret-index ambiguity (must-read)
`fretX(n+1) = L − r·(L − fretX(n))` with `r = 2^(−1/12)`: shifting all indices by one is an affine map of
`x`, hence absorbed by any projective fit. **Fret wires alone cannot identify which fret is which.**
Index anchors, in order of trust:
1. **Nut**: broad bright (or dark) bar, strings continue past it at a different angle, no wires beyond.
   NeckNet predicts nut corners explicitly; the manual lock asks for the nut corners explicitly.
2. **Inlay pattern**: score the 3-5-7-9-12(double) template in the strip for index shifts −2…+2.
3. **End of fretboard / body joint**, weak.
4. **The user**: lock confirmation draws fret numbers 1, 3, 5, 7, 9, 12 on the neck and offers
   `◄ shift ►` buttons. The chosen index is frozen for the session and saved in the guitar profile
   (inlay signature) to pre-resolve it next time.
Tracking must never change the index (nut anchor range < 0.5 spacing, see §4.3).

## 6. Lock
**Manual (Phase 3, always available).** Freeze frame → the user taps 4 points: nut-bass, nut-treble,
12th-fret-treble, 12th-fret-bass, each with a 4× magnifier loupe and drag-to-adjust; → `H₀` →
multi-start EdgeTracker (wide) → confirmation view (§5.4). Taps are saved as a prior for re-lock.
**Automatic (Phase 4).** NeckNet (§8) on the full frame at ~3–5 Hz while SEARCHING → control-point
candidates → multi-start EdgeTracker → index verification → VERIFYING for 5 consecutive consistent
frames → LOCKED. Ask for "hands off the neck, whole neck in view" during lock, as the reference app does.
**Per-guitar profile refinement.** After 2 s of stable lock, estimate taper and string spreads by
minimising across-cue residuals over the buffered frames (2-parameter search); persist per camera+guitar.

## 7. Hands (Phase 7)
MediaPipe Hand Landmarker, 2 hands, VIDEO mode, GPU delegate, run on the fretboard ROI (expanded
bounding box of the neck, upscaled to ≥ 256 px on the short side), every 2nd frame on slow devices.
- Fretting hand = the hand whose landmarks mostly project inside the board polygon.
- Fingertip contact estimate: `tip + 0.25·(tip − dip)` projected with `H⁻¹` → `(xMm, yMm)` → nearest
  string (by `stringY`) and fret cell (`fretX`), with a per-finger confidence from the landmark `z`
  ordering and from distance to the cell centre. Calibrate the 0.25 factor on the golden set.
- Barre detection: index finger MCP→TIP segment roughly parallel to a fret across ≥ 4 strings.
- Hand mask for the tracker: convex hull of landmarks dilated by 12 px.
- Output is **advisory**: a hint needs ≥ 0.6 agreement over 8 frames and is suppressed when the audio
  already confirms the target.

## 8. NeckNet (Phase 4) — coarse detector, synthetic-trained
- Input 288×160 RGB (letterboxed 16:9). Encoder: MobileNetV3-small-class (≈1 M params). Decoder to
  stride 4 (72×40).
- Outputs: `mask` (fretboard), 4 control-point heatmaps (`C0…C3`) + 2-channel sub-cell offsets each,
  `presence` logit, `orientation` (headstock left/right), `profile` logits (steel/electric/classical).
- Loss: focal heatmap + L1 offsets + BCE mask/presence. Occluded/out-of-frame corners are still
  supervised (extrapolated positions clamp to a margin band; weight 0.3).
- Export: ONNX opset ≥ 17, fp16 where supported, validated in `onnxruntime` (Python) and
  `onnxruntime-web` (Playwright) with a numeric-parity test (max abs diff < 1e-2 on heatmap peaks).
- Runs only in SEARCHING at 3–5 Hz, WASM single-thread is acceptable (budget 120 ms).
- **StripNet (conditional).** Only if gate G4.3 fails after the classical ladder: a tiny CNN on the
  rectified 384×64 strip predicting nut column, 12th-fret column, and edge rows at 3 stations; trained
  from the same generator by rectifying with a jittered pose.

## 9. Gates and benchmarks (`npm run bench:vision`)
Benchmarks are deterministic (seeded) and write JSON into `docs/benchmarks/`.
| ID | Benchmark | Gate |
|---|---|---|
| G3.1 | TS EdgeTracker vs Python reference on 200 seeded frames | same success rates ±3 pts; median along ≤ 0.03 fret |
| G3.2 | Basin after pyramid + strings + multi-start, init σ = 5 / 8 px | success ≥ 97 % / ≥ 90 % |
| G3.3 | Tracking sequences (60 synthetic clips, moving neck ≤ 15 px/frame, hand occluder) | ≥ 98 % frames good; 0 index slips |
| G3.4 | Jitter on static clips with sensor noise | ≤ 0.7 px RMS |
| G3.5 | Tracker cost | ≤ 2.0 M pixel-samples per frame in tracking mode (proxy for ≤ 6 ms) |
| G4.1 | NeckNet on synthetic val-B (unseen texture families) | control-point error median ≤ 6 px @720p, presence AUC ≥ 0.99 |
| G4.2 | NeckNet on 3-D rendered / photo-composite val-C | median ≤ 9 px |
| G4.3 | End-to-end auto-lock, standard framing | ≥ 95 % correct, ≤ 1 % wrong index, ≤ 0.5 % false lock on no-guitar clips |
| G4.4 | Real golden set (≥ 60 frames, ≥ 12 guitars) | ≥ 85 % correct lock; failures fall back to manual, never silent |
