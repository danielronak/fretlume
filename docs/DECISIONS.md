# Decisions log

Newest last. Architecture decisions A1–A10 are in `MASTER_PLAN.md` §2; this file records decisions made
while building. Format: id · date · context · decision · alternatives.

## D-001 · 2026-11-16 · Trunk-based development on `main`
**Context.** Single-owner project built by an agent in ephemeral containers; releases are tags deployed
from `main`; CLAUDE.md requires a push after every green step.
**Decision.** Commit directly to `main` once `npm run verify` is green. No feature branches or pull
requests unless the owner asks for them.
**Alternatives.** Branch + PR per phase (adds a merge step the owner would have to perform).

## D-002 · 2026-11-16 · TypeScript pinned to 6.0.x
**Context.** `typescript@latest` is 7.0, but `typescript-eslint` 8.72 supports `>=4.8.4 <6.1.0`.
**Decision.** Pin `typescript` to `~6.0.3`. Revisit when typescript-eslint supports 7.
**Alternatives.** Drop type-aware linting; rejected.

## D-003 · 2026-11-16 · SIL OFL 1.1 is acceptable for fonts
**Context.** The licence allowlist names software licences; open fonts are almost all OFL-1.1.
**Decision.** Allow OFL-1.1 for self-hosted font files only (Manrope Variable). Recorded in THIRD_PARTY.md.
**Alternatives.** System fonts only; rejected because the heading face is part of the visual identity.

## D-004 · 2026-11-16 · Hash routing
**Context.** GitHub Pages serves static files with no rewrite rules; the app must also cold-start offline.
**Decision.** `createHashRouter` (`/#/library`). Deep links work everywhere with no server configuration.
**Alternatives.** History routing with a 404.html redirect shim; more moving parts for no user benefit.

## D-005 · 2026-11-16 · Fake-camera fixtures are Motion-JPEG and generated, not committed
**Context.** One second of 720p `.y4m` is about 41 MB; the same clip as `.mjpeg` is 1.5 MB and Chromium
accepts both for `--use-file-for-fake-video-capture`.
**Decision.** Fixtures are `.mjpeg` + `.wav`, produced deterministically by `npm run fixtures` into
`fixtures/generated/` (git-ignored). `.y4m` stays available in `tools/fixtures/lib.mjs` for exact-pixel tests.
**Alternatives.** Commit binary fixtures; rejected (repo bloat, harder to regenerate).

## D-006 · 2026-11-16 · Service worker updates only on request
**Context.** A silent reload in the middle of a practice session would be disruptive.
**Decision.** `registerType: 'prompt'` with `clientsClaim` on first install; a toast offers "Reload" when
a new version is waiting.
**Alternatives.** `autoUpdate`; rejected.

## D-007 · 2026-11-16 · Known advisories in build-time tooling
**Context.** `npm audit` reports moderate advisories in `workbox-build`'s transitive dependencies
(`deepmerge`, `glob`). They run only at build time on our own files and are not shipped.
**Decision.** Accept for now; the suggested fix downgrades `vite-plugin-pwa` across a major version.
Re-check at each phase end.

## D-008 · 2026-11-16 · Releases are version bumps, tagged by the workflow
**Context.** The build session's git access pushes branches but refuses tags (`git push origin v0.0`
disconnects), so the planned "push a tag to deploy" flow cannot be driven by the agent.
**Decision.** A release is a commit on `main` that changes `version` in the root `package.json`.
`.github/workflows/deploy.yml` ("Release") builds it, deploys to GitHub Pages and creates the tag
`v<version>` itself. Plan releases map as v0.1 → `0.1.0`, v0.10 → `0.10.0`, v1.0 → `1.0.0`.
**Alternatives.** Ask the owner to push tags (manual work); deploy every push to `main` (no release points).

## D-009 · 2026-11-16 · CAGED scale positions are fret windows; marks carry a list of groups
**Context.** Published CAGED scale diagrams disagree at the edges (some start on the root and so show
different frets on the two E strings). The spec's reference test for G major's E shape listed the low
E string as frets 3–5 only.
**Decision.** A position is *every scale tone inside a fret window* defined relative to the tonic's fret on
the lowest string, with one window table for major-third tonics and one for minor-third tonics
(`core/theory/scales/positions.ts`). Both E strings therefore always match, the positions tile the neck
with no gaps, and the same rule serves every scale and arpeggio. G major's E shape is frets 2–5 on all
strings (low E: 2, 3, 5). A minor pentatonic box 1, C major open position and E minor pentatonic open
position match the standard diagrams exactly. `Mark.groups` is a list (not a single `group`) so that
notes shared by neighbouring positions carry both; muted strings live on `Shape.muted`.
**Alternatives.** Hand-typed templates per scale (error-prone, no rule for exotic scales).

## D-010 · 2026-11-16 · Generated chord voicings only top the list up
**Context.** The voicing generator always returns valid, playable shapes, but some are unidiomatic.
**Decision.** `chordVoicings` lists hand-authored and moved shapes first and adds generated shapes only
until there are four voicings. Each voicing carries `source` so the UI can label generated ones.
Three-notes-per-string positions are limited to 5 frets per string (not per position, which can span 7).

## D-011 · 2026-11-16 · Library search is a small custom scorer, not MiniSearch
**Context.** The plan named MiniSearch. The catalogue is about 750 generated items and the queries are
structured ("sad chords in G", "Am7", "what has C E G").
**Decision.** `core/theory/library/search.ts` parses kind, root, chord symbol, mood words and note lists,
then scores items with exact, alias, tag, prefix and one-typo matches. Deterministic, dependency-free,
covered by 62 query expectations. Revisit if the catalogue grows to free-text content (lessons, songs).
**Alternatives.** MiniSearch (generic relevance ranking would still need the same query parsing on top).

## D-012 · 2026-11-17 · Settings live in localStorage; collections live in IndexedDB
**Context.** The plan listed a `settings` table in the Dexie schema. Theme and handedness are needed
synchronously before the first paint and the first diagram, and IndexedDB is asynchronous.
**Decision.** Settings are a Zustand store persisted to `localStorage` (`fretlume.settings`, versioned,
sanitised on load). Favourites, folders, runs, tabs, events, skills and profiles live in Dexie. Backups
contain both. The Dexie schema has no `settings` table.
**Alternatives.** Dexie-only with an async startup gate (a blank first frame or a theme flash).

## D-013 · 2026-11-17 · Audio capture graph
**Context.** An AudioWorkletNode that is not connected towards the destination may not be processed
by every browser, but the microphone must never be heard through the speakers.
**Decision.** source → capture worklet (mono mix, 1024-sample blocks, RMS and peak) → gain 0 → destination.
The worklet writes only zeros to its output. The worklet is bundled with Vite's `?worker&url` import so it is
precached like the rest of the app. Echo cancellation, noise suppression and auto gain are requested off;
when the browser reports any still on, the panel says so (fallback ladder, phase 2).
**Alternatives.** A zero-output worklet (not processed reliably everywhere); ScriptProcessorNode (deprecated).

## D-014 · 2026-11-17 · Pitch detector refinement for stiff strings
**Context.** On a plucked tone with realistic string stiffness (inharmonicity B ≈ 1e-4), plain MPM read up
to 4.5 cents sharp just after the attack, fading over about a second; through the fake microphone every
open string read 1.2–1.7 cents sharp, failing G6.1.
**Decision.** `PitchDetector.detect` runs a second pass on a copy low-passed (two Butterworth sections) at
1.5 × the first estimate, measured from 512 samples after the note onset so the filter has settled.
Steady-state error drops to ≤ 0.2 cents. The first stable reading still comes within 150 ms (within 5 cents)
and is within 1 cent by 400 ms, the in-tune hold time.
**Alternatives.** Harmonic-sum estimation (more code, no measured benefit here); ignoring the bias (fails G6.1).

## D-015 · 2026-11-17 · Reference tones and clicks are pre-rendered buffers
**Context.** The plan named a Karplus–Strong AudioWorklet.
**Decision.** Tones are rendered once per pitch (Karplus–Strong with an all-pass tuning stage, within
1 cent from E2 to E5) into AudioBuffers and scheduled with `start(time)` on the audio clock; metronome
clicks likewise. Simpler, sample-accurate, and testable in Node. A worklet is only needed for live,
parameter-varying synthesis (Phase 10 band).
**Alternatives.** Worklet synthesis now (more moving parts, nothing gained yet).

## D-016 · 2026-11-17 · Lock refinement: one-coordinate measurements, tap-anchored search, G3.2 fallback
**Context.** Gate G3.2 asks for ≥ 97 % lock success at σ = 5 px tap noise and ≥ 90 % at σ = 8 px. The ported
reference tracker reaches 13 % / 6 % on the current synthetic frames (strings with shadows). Diagnosis on the
seed-31 frames showed three causes: (1) each fret wire and string was fitted as a full 2-D point, so the
coordinate it does not measure was pinned to the starting estimate; (2) tap noise appears as perspective, off
by up to 2 fret spacings at fret 7 and 12 at fret 17, outside the comb search range; (3) the six-string
pattern aliases by one string when the start is off across the neck.
**Decision.** In the improved mode: fit the inverse homography from line constraints (fret wires fix board x,
strings and the board-edge midpoint fix board y; separate robust scales per axis); anchor the wide comb at
frets 0, 7, 12 (taps at 0 and 12, wide range at 7) and re-run a narrow comb every round; widen the strip to
±48 mm and score the board edges (wide step filter, midpoint only, since the neck side shows 1–2 mm outside the
board); cap per-round control-point moves; try both wire polarities and keep the better score. Parity mode
is unchanged (G3.1 still passes). Offer two optional taps at the 5th-fret corners (6-point fit).
**Measured (held-out seed-32 frames, `docs/benchmarks/vision-phase3.json` G32).** 4 taps: 91.5 % (σ 5),
86.5 % (σ 8). 6 taps: 91.5 % (σ 5), 91.5 % (σ 8). From exact taps 93.5 %: the remaining failures are mostly
maple boards with dark wires, where strings show as their offset shadows, and fits are self-consistent, so
the score cannot flag them (verified threshold 0.9 accepts 18 % of locks at 100 % precision).
**Gate.** G3.2 fails at σ = 5 px (91.5 % < 97 %); σ = 8 px passes with 6 taps (fallback ladder step 2).
Following step 3, the remainder is carried to Phase 4 (learned strip model). The lock UI always shows the
confirm step, so the player checks the grid; "verified" is shown only at confidence ≥ 0.9.
**Alternatives.** More hand-tuning against renderer details (risk of fitting the generator, not guitars);
multi-start (the score does not separate right from wrong fits, measured on 39 failures: 20 vs 19).

## D-017 · 2026-11-17 · Tracking loop: anchored to the confirmed lock, 3 rounds, faster filter
**Context.** First G3.3 run (60 synthetic clips, moving neck, hand): 81.5 % frames good. On light boards the
tracker settles a few mm away from the true pose; the One-Euro filter (β = 0.02) lagged behind a moving neck,
causing most remaining across-neck failures (202 of 275 bad frames vanished with the filter off).
**Decision.** (1) At lock, the tracker measures the lock frame once and keeps the board-space map from its
own fit to the confirmed pose; every later measurement is corrected by it, so the confirmed pose (including
corner adjustments by the player) is what stays on the neck. (2) Three refinement rounds per frame
(0.29 M pixel samples, budget 2.0 M). (3) One-Euro min cutoff 1.5 Hz, β = 0.3.
**Measured.** G3.3: 98.2 % frames good (pass), 1 of 60 clips slips the fret index (gate 0, fail: maple board,
dark wires, a hand whose fingers look like wires; the pose drifts along the neck over ~10 frames). G3.4:
0.93 px RMS (gate 0.7, fail; one clip's nut, near the image edge, scatters ±6 px along the neck; 10 of 12
clips are below 0.7). G3.5: 0.29 M samples per frame (pass).
**Tried and dropped.** A slower speed estimate (d-cutoff 0.3 Hz): jitter 0.83 px but G3.3 falls to 97.7 %.
The prediction as a soft prior in the fit: jitter got worse (1.2 px) because the prediction carries noise.
**Next.** The fallback ladder's remaining steps (weight the unoccluded half of each fret; hold-and-fade) and
an index guard against slow along-neck drift; real-camera field data will show whether nut jitter matters.

## D-018 · 2026-11-17 · Stage, e2e clips, diagnostics format, tracker speed and index guard
**Context.** Building the Stage (tasks 3.7–3.11) and running it on synthetic clips through the fake camera.
**Decisions.**
- *Lock flow.* Freeze the video, drag four numbered handles (optional 5th-fret pair) with a loupe, snap,
  confirm with fret numbers 1·3·5·7·9·12 and ◄ shift ►. "Verified" is shown only at confidence ≥ 0.9
  (D-016); otherwise the player is asked to check the grid. The tracker then starts from the confirmed
  pose, measured once on the lock frame (D-017). Taps are remembered (settings `lockTaps`).
- *Speed.* Rectification without per-pixel allocation and typed median buffers: 88 → 50 ms per tracked
  frame in the container, same results (G3.1 unchanged).
- *Index guard.* While recovering (wide search from a stale pose) a fit that moves the nut or 12th fret
  by about half a fret or more is refused; during normal tracking it held too many good frames (G3.3
  fell to 93 %), so it applies to recovery only. Fast motion during a hold can still slip the index;
  index verification from the nut and inlays (spec 01 §5) remains to be done.
- *E2E clips.* Moving clips hold still for 2.5 s (the player locking), then move at ≤ 3 px/frame and play
  back in reverse so the looping fake camera never jumps: the container processes about 10 frames/s,
  and faster motion is covered by G3.3, which sees every frame. The capo clip uses a rosewood board so
  it tests the capo; light boards are covered (and failing) in the benchmarks. CI installs `uv`
  (astral-sh/setup-uv) to render the clips.
- *Diagnostics.* One JSON file (pose log, lock attempts, events, device type, settings, optional frames)
  instead of a zip, so no new dependency yet. Camera frames only after the player switches them on in
  Settings → Field test; they live in memory (last 15 s, 2 per second) and are deleted when switched off.
**Alternatives.** A zip library (MIT, small) when frame volume grows; index guard always on (rejected,
above); a clip per tracked motion speed (later, with field data).

## D-019 · 2026-11-17 · NeckNet runs on our own small runtime, not onnxruntime-web
**Context.** Spec 01 §8 planned ONNX + onnxruntime-web. Its WASM binaries are ~10 MB against the 12 MB budget
for model + runtime, and the multi-threaded build needs cross-origin isolation headers that GitHub Pages
cannot send.
**Decision.** NeckNet uses only ops a ~250-line TypeScript runtime implements (`app/src/vision/nn.ts`):
1×1/3×3/depthwise convolutions with batch norm folded in, ReLU6, add, nearest ×2 upsampling, global pooling,
linear. `ml/train/export.py` writes fp16 weights (≈ 1 MB) and the op list; parity with PyTorch is a unit test
(`nn.test.ts`, the spec's < 1e-2 criterion relative to the output size). Bundle cost: the model file only.
**Alternatives.** onnxruntime-web (size, threads); TF.js (size, its own WebGL quirks).

## D-020 · 2026-11-17 · Generator v2 and the evaluation splits
**Decision.** Training frames are rendered at 576×320 and area-downscaled to the network's 288×160 (as a
camera frame is), with camera effects applied at the final size; neck textures come from a per-worker pool
(≈ 200 frames/s on 4 cores). Splits: train (300 k frames, 12 % without a guitar), val-A (same families, new
seeds), val-B (held-out pau-ferro board, trapezoid and blob inlays, checked clothing), val-C (instead of 3-D
renders: a photo-composite style — defocused backgrounds with bokeh, a lighting gradient and strong glare),
negatives. The `bpy` 3-D route (task 4.2) is skipped: val-C covers the domain-gap check at a fraction of
the cost; the real-photo golden set (4.9) is the stronger check.
**Index verification.** Fret wires cannot fix the index, so after any lock the index is checked from the
inlay pattern (spaces 3·5·7·9·12·15·17) and the nut (wires in front, none behind, brightness change): 97.2 %
correct over shifts −2…+2 on held-out frames (dots 98.3, blocks 95.5, plain boards 94.7). Ties keep the
fit's index. A weak margin makes the confirm step ask the player.

## D-021 · 2026-11-17 · Automatic lock ships as an opt-in beta; G4.3 fails, G4.4 not measured
**Context.** NeckNet v1 passes its own gates (val-B 3.3 px, val-C 3.9 px median at 720p; presence AUC 1.0).
End to end, on 200 held-out 720p frames in the Phase 3 style (single-frame proxy for G4.3): 85 % correct,
3 % wrong fret index, 0 % false locks without a guitar (gate 95 / 1 / 0.5). Failures are mostly a hand over
the 12th fret pulling that corner off, which leads the fret fit to a wrong scale. The browser e2e
(`autolock.spec.ts`) passes on lock-easy, lock-hard, lefty, capo and low-light and never locks on no-guitar.
**What was added to reach that.** Bass corners are the upper ones (labels and app); multi-start over the
detected 12th fret (as 11, 12, 13) and over a rebuilt hidden corner; the fit's index re-anchored at the
detected nut; a clearly seen nut outweighs a weak inlay verdict; fits showing wires midway between their
frets are rejected as aliases (ratio 0.6); minimum fit confidence 0.62 (calibrated: no correct lock lost).
**Decision (fallback ladder step 3).** Manual lock stays the default; "Lock automatically (beta)" is an opt-in
toggle on the Stage. Every automatic lock goes through the same "Looks right?" step with fret numbers, so a
wrong index is visible before playing. StripNet (task 4.7) is not attempted yet: the remaining errors come
from the corner detector under occlusion, which retraining with more hand-over-12th cases or a second
detection at a different frame is likelier to fix; revisit with field data.
**G4.4 (real photos).** The owner approved commons.wikimedia.org and upload.wikimedia.org for the environment,
but this session's automatic permission check refused the first download, so no real frames were
collected. G4.4 is "not measured"; the owner's field test (diagnostics with frames) is the next real check.
**Speed.** NeckNet takes 174 ms per frame in this container (budget 120 ms): searching runs at ~3–4 Hz
instead of 5. Acceptable while it only runs before a lock; to be confirmed on real devices.

## D-022 · 2026-11-18 · Fit as a board-space correction; strings cannot twist the frets; tracking guards
**Context.** Field test 2 (0.3.1 diagnostics: 100 frames at 640 px of the owner's steel-string acoustic, dark
board, faint strings, fretting hand on the neck). Replaying them through the app's code showed: NeckNet's
corners were usable on 13 of 16 sampled frames (nut corners within a few px, fret index right), but the
fret fit then slanted the grid; with a still guitar the tracked nut corners jumped 10–40 px per frame, a fit at confidence
0.31–0.42 was accepted as a lock, and tracking was lost by frame 22 (2.2 s). Cause: the fit solved fret wires
(board x) and strings/edges (board y) together, so they share the homography's perspective terms; where the
string cue misreads faint strings it tilts every fret wire. Switching the string cue off brought the nut error
on these frames from 10–35 px to 1–5 px.
**Decision.** (1) `refine` (improved mode) fits a board-space correction of the current estimate
(`fitCorrectionFromLines`): the fret wires set the along-neck row and the perspective, the strings and edges
then set the across-neck row; the perspective is damped towards "no change" — weakly when locking (taps
need their perspective corrected), strongly while tracking, where the wires' tilt across the board is damped
too. (2) While tracking, a second fit that lets the strings carry up to the wires' weight in the perspective
is also tried, and the fit more measurements agree with (fixed tolerances 1 mm along, 0.6 mm across) is
kept: a light board with dark wires needs the strings (synthetic maple clips slid otherwise), a real board
with faint strings must not use them. (3) Tracking refuses a fit that moves a control point by more than a
nut width from where the search started, or changes the board's nut/12th-width proportions by more than
35 % from the lock. (4) Auto-lock ranks its candidate fits by confidence × (1 − midway-wire ratio), so a
wrong-scale fit that ties on score loses (it put one replayed frame 2–3 frets off). (5) With auto-lock on, the
Stage goes back to searching when tracking reports the neck lost, and resumes tracking without the confirm
step when the new lock's index is certain and the player's earlier confirmation needed no fret shift.
**Measured.** Owner's frames, auto-lock on frame 0 then tracking: right lock, 1–7 px per frame through 42
frames of fretting and strumming (before: wrong-scale lock possible, 10–40 px per frame, lost at frame 22);
when the guitar is lifted quickly the guard holds the last pose. Synthetic (`vision-phase3.json`): G3.2 4 taps
94.5 % σ5 / 91.5 % σ8 (was 91.5 / 86.5), 6 taps 92.0 / 93.5; G3.3 99.2 % good frames, 0 slips (was 98.2 %,
1 slip — passes now); G3.4 jitter 0.36 px RMS (was 1.05 — passes now); G3.5 unchanged; G4.3 87.5 % correct,
2.0 % wrong index, 0 % false locks (was 85 / 3 / 0, still failing). Confidence calibration moved: 0.9 now
gives 97.3 % precision, so the verified threshold is 0.93 (100 % of 14 % of locks).
**Alternatives.** Turning the string cue off (stable on the real frames, but the across-neck position could
then never be corrected from the image); a fixed compromise share of the strings in the perspective (0.3:
the real grid wobbled again, the maple clips still slid). Owner frames are not committed (privacy); the
replay scripts were run from the session scratchpad.

## D-023 · 2026-11-18 · Tracking through angle changes: per-frame guard, index correction, watchdog
**Context.** Owner, on 0.3.2: "a change in angle — if I tilt the camera or the guitar — and the tracking is
messed up; it did not find the neck by itself at the new angle." The synthetic tracking clips (G3.3) only
ever turned the guitar by a few degrees and never tilted it, so the benches could not see this. Replaying the
owner's recording showed the mechanism: when the guitar was lifted (motion blur), the narrow search landed 1–2
frets towards the headstock and the grid stretched, yet the state stayed "locked" at normal confidence, so the
Stage never searched again. On new tilt clips, wrong grids score as high as right ones (self-consistent fits),
so confidence cannot flag them; the D-022 shape guard (35 % from the lock) also refused a real gradual tilt.
**Decision.** (1) New clip kind `track-tilt` (8–25° turns, perspective and foreshortening changes, drift) and
bench G3.3t, tracked at the app's ~7.5 Hz, plus a pass that starts one fret off. (2) The shape guard compares
with the last accepted frame, and the board's nut-to-12th length may change by at most 8 % per 133 ms.
(3) Every 200 ms the inlay/nut index check runs on the tracked grid (3.8 ms against 76 ms for a tracking
step); three verdicts in a row with margin ≥ 0.6 shift it back by whole frets (on the owner's guitar the hand
hides the inlays and the nut cue alone gives ≈ 0.8; on the dim e2e clip single wrong verdicts reached 0.75,
hence three, not two). (4) With NeckNet loaded (auto-lock on), a watchdog compares NeckNet's corners with
the grid twice a second; two clear disagreements (nut ¾ of a nut width away, 12th fret 1½, or no neck) end
tracking, and the automatic lock searches again. It runs in the worker after the frame's pose has been sent,
so the overlay never waits for NeckNet. (5) Tracking enters RECOVERING only after frames fail, not because
time passed since the last good frame: a slow frame (NeckNet in the browser, a pause) had sent the tracker
into a wide re-search that jumped (seen as 10–15 mm spikes in the e2e auto-lock tests). Constant-velocity
prediction is capped at 250 ms. Damping (D-022) is unchanged: a sweep showed it is not what limits tilts.
**Measured.** G3.3t: 92.1 % good frames, 0 index corrections without a slip; started one fret off: all 24 clips
corrected (median 4 tracked frames, ≈ 0.5 s). Remaining failures: maple boards one string off across the neck (the known
D-016 weakness) and a neck running out of the frame. Owner's frames: started one fret off either way,
corrected within 3–10 frames; the lift no longer stretches the grid. Single-frame auto-lock at the final angle
of the tilt clips: 66/72 right, 4 wrong, 2 none. G3.3 99.2 % / 0 slips and G3.4 0.36 px unchanged.
**Known flaky test.** `autolock.spec.ts` low-light fails about half the runs on this 4-vCPU container
(worst dot error ≈ 3.3 mm against a 3 mm limit), equally with the 0.3.2 vision code; it passed when Phase 4
closed. Not part of `verify` (CI). Left as is and recorded rather than loosened; to revisit with the
low-light tracking accuracy.
**Alternatives.** The index guard on every frame (refused real fast moves; a synthetic clip then slipped);
weaker damping (no gain on tilts, losses on the hard clips); a relative confidence drop (wrong fits do not
drop).

## D-024 · 2026-11-19 · Watchdog needs three of four corners and three checks
**Context.** Owner on 0.3.3: "it almost doesn't work at all now". The diagnostics (no video) showed tracking
ended by the watchdog while the fit was good (confidence 0.77 one frame before). Replaying the 0.3.1
recording through `VisionCore` at the owner's tier (640×360): NeckNet put one or two corners on something
else in the room (e.g. the nut corner at (601, 259), score ≈ 0.5) on 11 of 43 frames, several in a row; the
D-023 watchdog compared nut and 12th-fret midpoints, so one stray corner counted as a wrong grid.
**Decision.** The watchdog calls the grid wrong only when at least 3 of NeckNet's 4 corners (each with score
≥ 0.4) are more than a nut width from the grid, on 3 checks in a row (≈ 1.5 s). A really lost grid
disagrees at every corner.
**Measured.** Owner's recording: 43/43 agree (was 32 agree, 11 disagree). Synthetic lefty and lock-hard
clips: 35/35 agree. A grid moved off the neck still disagrees (unit test).
**Browser tests.** `autolock.spec.ts` lefty and low-light fail some runs on this container (worst dot error
3.6–4.5 mm against 3 mm, steady, with or without the index correction; low-light tracking at 640×360 is weak:
29/74 good frames offline). In one lefty run the automatic lock was a fret off and the D-023 index correction
fixed it (logged, margin 0.91). Not in `verify`; recorded, not loosened.
**Lesson.** D-023 was validated on synthetic clips, where NeckNet's corners are clean, and on the real
recording only with `TrackingSession`, not with the watchdog. Real-frame replays now go through
`VisionCore` (worker logic) at the owner's processing size.

## D-025 · 2026-11-19 · Auto re-lock really resumes; NeckNet re-acquires while recovering; dot size works
**Context.** Owner on 0.3.4: works well with angles, but quick moves lose tracking, "retracking never comes
right", and the dot size cannot be changed. Diagnostics (1515 poses, no video): after each loss the
automatic lock found the neck ("auto-resume"), but no pose was recorded until the owner re-locked by hand,
up to 50 s later. Cause: the resume path started the frame pump and then switched to the tracking phase;
the framing effect's clean-up ran after it and stopped the pump (and the worker's session). The dot size:
dots have a minimum on-screen radius (7 px) so a small neck stays readable; with the neck small in the
owner's picture every dot sat on that floor, so the setting (60–160 %) changed nothing visible.
**Decision.** (1) The resume is started by an effect after the phase change; e2e test "after losing the
neck" (debug hook forces a loss) fails on the old code (frame stamp frozen) and passes now. (2) While
tracking is RECOVERING and the player's grid needed no fret shift, NeckNet detection + snap + index check
run up to 4×/s and re-lock at once when the index is certain; a watchdog disagreement triggers the same.
With NeckNet loaded, RECOVERING turns into SEARCHING after 0.7 s instead of 1.5 s. (3) The dot size range
is 40–200 % and the minimum on-screen size scales with it; letters follow the dot and are left out on dots
under 6 px radius.
**Measured.** Fast moves (tilt clips, every 12th frame ≈ 0.4 s of motion per tracked frame, 12 clips):
lost 3 → 0, good frames 228/321 → 270/348; the owner's recording: no spurious re-acquire, tracking
unchanged. Remaining: on such fast moves the grid can sit wrong for a while before a check catches it.

## D-026 · 2026-11-19 · Smooth overlay by prediction; dim rooms: weak index verdicts do not shift a fit
**Context.** Owner on 0.3.5: works quite well; wants it seamless and smooth (the grid trails a moving neck)
and better in a dim room. Video (10 s, 10 Hz tracking, 65 ms per frame): while moving, the grid trails by
about a fret for a few frames and steps ten times a second.
**Decision (smoothness).** The Stage draws the grid for the capture time of the video frame on screen
(`requestVideoFrameCallback` metadata), predicted from the velocity of the last tracked poses
(`overlay/predict.ts`: gain 0.9, at most 150 ms ahead, soft dead band below 0.03 px/ms so the tracker's own
wobble on a still guitar is not extrapolated). Blending between poses was tried and dropped: it brought the
lag back (error 4.2 → 5.6–6.4 px). The One-Euro filter is unchanged (lighter settings gained < 0.2 px).
**Measured.** Bench OverlayLag (20 moving clips, 10 Hz, 100 ms latency, frame on screen 30 ms after
capture): mean error 6.72 → 3.82 px, frames fully right 54.2 → 64.8 %. Owner's still recording: drawn-grid
movement per screen frame 0.28 px without prediction, 0.32 with. The e2e overlay checks compare the drawing
with the clip frame it describes (`describesMs` in the debug object); on this container tracking runs at
2–3 Hz, too slow for the predictor to engage, so the browser tests mostly check the unpredicted path.
**Decision (dim rooms).** In the dim e2e clip the fret wires are darker than the board; with that polarity
tracking is 99/99 at 640×360 (my first measurement had forced the bright polarity). Auto-lock was one fret
off on 10 of 15 frames: with the inlays invisible, index verdicts with margins of 0.03–0.05 shifted a fit
that the NeckNet nut anchor had placed right. Verdicts with a margin under 0.15 are now treated as
undecided (the anchored fit stands); the same threshold already decided "index sure". A contrast stretch
of the strip was tried and dropped (no gain).
**Measured.** Dim clip auto-lock 5/15 → 11/14 right. G4.3: correct 87.5 → 89.0 %, wrong index 2.0 → 0.5 %
(the ≤ 1 % part of the gate is now met; ≥ 95 % correct still is not), false locks 0. Remaining dim-light
bias: about ¼ string spacing across the neck (within the tolerance).

## D-027 · 2026-11-19 · Continuity after a short loss: keep the previous fret index
**Context.** Owner on 0.3.6: smoother, "quite good", but covering the frets makes the overlay go away for a
while. Diagnostics: four losses in the session; three of the automatic re-locks that followed were not sure
of the fret index ("index false", the hand over the inlays), so the Stage froze the picture and asked the
player to confirm the grid, and the overlay was gone until they did. The NeckNet re-acquire while
recovering (D-025) likewise needed a certain index and so did not fire.
**Decision.** `alignToPrevious` (lock.ts): a new fit with an uncertain index is moved by whole frets so its
nut lands on the nut of the grid shown just before; if no shift brings it within ¾ of a nut width, the
guitar has really moved and the usual rules apply (confirm step). Used by the re-acquire while recovering
(VisionCore) and by the Stage's automatic resume (loss less than 10 s ago, earlier confirmation needed no
fret shift).
**Measured.** Unit tests (one or two frets off either way → aligned; a moved neck → refused). Fast-move
clips unchanged (270/348 good, 0 lost). Not yet measured on a real occlusion: next field test.

## D-028 · 2026-11-19 · Lag: 42 % less work per tracked frame; watchdog once a second
**Context.** Owner on 0.3.7: a bit of lag; asked to work on it before new features. Their laptop spent 66 ms
per tracked frame (640×360), so the grid updated about every 100 ms (every 3rd camera frame). Profile on
the owner's frames: rectifying the strip 27.8 ms and the string cue 25.5 ms of 73 ms (three rounds each).
**Decision.** (1) Colour frames are converted to a luma plane once per frame (the strip read four RGBA
pixels per sample in each of three rounds). (2) Whether strings show lighter or darker is decided in a
refinement's first round and reused in later rounds. (3) While tracking, the string cue reads every second
column between frets (its profile is a median across them). (4) While tracking, a round that moves no
control point by more than 1 px ends the refinement (a steady guitar settles in two rounds). Locks keep all
columns and rounds. (5) The NeckNet watchdog checks once a second with two strikes (was twice a second,
three strikes): each check delays one tracked frame in the same worker.
**Measured.** Same process, interleaved, owner's frames: 91 → 53 ms per frame (−42 %); image samples per
frame 294,912 → 212,740 (G3.5). G3.3 99.5 % good, 0 slips (was 99.2 %); G3.3t 92.5 % (was 92.1 %); G3.4 jitter
0.34 px; G3.2 4 taps 94.0 / 91.0 %, 6 taps 92.0 / 93.0 % (≈ unchanged); G4.3 88.0 % correct, 1.0 % wrong
index, 0 false locks. On-screen error while moving, each tracker at its rate on the owner's laptop (0.3.7 at
10 Hz / 100 ms; now ≈ 15 Hz / 65 ms): mean 3.82 → 2.12 px, frames within 5 px 76 → 90 %. At a fixed 10 Hz the
new tracker's mean is higher (5.19 px) because of one clip where, after a fast move stopped, the
constant-velocity start overshot and the grid slid a fret per frame; at 15 Hz that clip tracks
(6.7 px mean). Starting the search at a fraction of the predicted motion was tried and made things worse.
In the app the watchdog catches such a slide (and the re-acquire puts the grid back).

## D-029 · 2026-11-19 · Tabs: alphaTab for Guitar Pro and MusicXML, loaded on import only
**Context.** Task 5.6 asks for GP3–GP8 and MusicXML import via alphaTab "if licence and packaging allow",
plus ASCII, ChordPro and JSON. alphaTab 1.9.0 is MPL-2.0 (allowed, used unmodified) and ships an ES module
of its core (1.2 MB minified) that reads scores headless, in the browser and in Node. Its Gp7Exporter can
write Guitar Pro files, so binary fixtures need no third-party files.
**Decision.** (1) `@coderline/alphatab/core` is imported dynamically by the importer only, so it is a separate
chunk; the service worker still precaches it for offline import (first-load transfer 2.63 → 3.98 MB, under
the 5 MB guard). (2) Each stringed track becomes a `Tab`; the player picks one when there are several. Only
the first voice is read; tied notes lengthen the previous beat; grace notes are skipped; techniques map to
ours (hammer/pull from `hammerPullOrigin`, slides from `slideOutType`+`slideTarget`, bends from the curve's
highest point, release types → `r`, dead → `x`, vibrato → `~`, palm mute → `pm`). (3) MusicXML without a
tab staff (pitches only) is placed on a standard guitar by a greedy nearest-hand fingering
(`core/tab/fingering.ts`). (4) The GP fixture is generated by `npm run fixtures` from our own alphaTex riff;
ASCII, ChordPro and MusicXML fixtures are hand-written in `fixtures/tabs/`. GP8 has no exporter to test
with; alphaTab reads it, but our coverage is GP7 + MusicXML + ASCII + ChordPro.
(5) ChordPro: one bar per chord with a strum on every beat (first library voicing); words are not kept
(the tab model has no lyrics) and the import message says so.
(6) Canonical tab form everywhere (editor, importers, storage): notes sorted by string, one per string,
`rest: true` only on empty beats, so export → import compares equal.
**Alternatives.** Our own GP binary parsers (weeks of work for five formats); MusicXML-only (most tabs people
have are GP files); bundling alphaTab in the main chunk (+1.2 MB for every visit).

## D-030 · 2026-11-19 · Tab play-along: rings slide in from the bridge; wait-mode waits for Phase 6
**Context.** Task 5.7 and spec 05 §4: current notes solid, upcoming as approaching rings, chord ghost one
beat early, scrolling strip. The UX table also lists "wait-mode", which needs the note verification of
Phase 6.
**Decision.** Notes appear two beats ahead as rings 45 mm toward the bridge (on the flat neck 1.5 fret
widths), twice the dot size, fading in, and reach their spot as the beat starts; the sounding note is a
solid dot with the bright ring used by practice runs. The next bar's chord appears as ghost dots one beat
before the bar (first library voicing, moved up by the capo). Frets in a tab count from the capo; on the
neck they are drawn capo + fret. The strip is one line of tab under a fixed playhead (80 px per quarter),
moved by a transform each frame (no React work per frame). Wait-mode is deferred to Phase 6 (mic).
**Alternatives.** Rings converging on the spot in place (no motion along the string: harder to read which
string is next); a full-width scrolling highway (more screen than the deck has on phones).

## D-031 · 2026-11-19 · Listening engine: unique-harmonic evidence; G6.3 fails, fallback ladder applied
**Context.** Task 6.2 and gates G6.2–G6.6 on the generated corpus (`npm run fixtures:audio`: our
Karplus–Strong twin and FluidSynth's General MIDI steel/nylon/electric guitars, clean and augmented).
**Decision.** (1) **Chords:** a note counts by its *unique* harmonics — the partials no other expected
note also produces (8192-point spectrum, 1/3-octave-median whitening, first 10 harmonics); a note whose
harmonics are all shared (an E4 over an E3) is `unsure` and passes. Missing notes are compared with
neighbours ±1–2 semitones ("a fret off"), silent strings with their open pitch. The plain comb sum with
explaining-away (spec §4.2–4.3) was tried first: clean strums passed, but 93–97 % of faults went
unnoticed, because a missing note's comb windows fill with other notes' partials. (2) **Strum timing**
(`strum.ts`) refines unsure notes when the strum is slow enough (≥ 22 ms per string): a doubled note's
partials must rise at a moment apart from its partners' plucks. (3) **Single notes** (`verifyNote`): the
note's odd harmonics must be present (the octave above cannot pass), the octave below's odd harmonics
absent, no neighbour clearly stronger; thresholds relative to the strongest candidate (leakage beside a
loud partial reached 5–15 against partials of 1 000+). After a pluck, only new energy counts. (4)
**Onsets:** log spectral flux picks the frame; the time is refined to where the energy of the
first-differenced signal rises (a pluck's click), and a pluck's own ripple is suppressed for 120 ms.
FluidSynth's samples start 10–12 ms after note-on, so the timing truth uses the measured start
(`sourceLatencyS` in the manifest). (5) **Self-masking:** onsets within 60 ms of a sound the app started
are ignored, and verdicts use new energy only. (6) **Chroma** ("What am I playing?") is greedy pitch
picking, shown as the top three guesses; not graded.
**Measured** (`docs/benchmarks/audio-phase6.json`): G6.2 ✅ F1 0.994, octave errors 0.37 % · G6.4 ✅ median
1.0 ms · G6.5 ✅ 0 false passes in 49, played notes 100 % · G6.6 ✅ 1.5 % of one core · G6.3 string-by-string
✅ muted recall 1.00, played strings 1.00 · **G6.3 strum mode ❌** (standard): clean pass 0.951 (false-fail
4.95 % ✅), faults caught 0.785, muted-string recall 0.697 (gate 0.75), overall accuracy 0.889 (gate 0.92).
A present-looking chord note is also called "a fret off" when a semitone neighbour is 3.5× stronger
(leakage from a loud neighbour had lifted it over the threshold); this raised faults caught from 0.760.
Chroma top-1 0.32–0.43, top-3 0.66–0.83.
**Fallback ladder** (phase 6): (a) relaxed leniency is the default for beginners (false-fail 3.7 %); (b) when
a chord verdict has unsure notes or low confidence, the app offers the string-by-string check, which
finds a muted string every time on the corpus; (c) lessons run string-by-string the first times a chord is
learned (spec §4.7). Muted octave doublings are undecidable from one strum's spectrum; they remain the
open item for G6.3 (more strum-timing work or hand vision in Phase 7).
**Alternatives.** NNLS with fixed harmonic templates (envelopes differ too much between guitars);
trained transcription (needs a model and real data, ADR A4 avoids it).

## D-032 · 2026-11-20 · Listening in practice: wait-mode, timeline judging for tabs, silent playback
**Context.** Tasks 6.4–6.6: judge the player on the Stage deck, in tab play-along and in free play.
**Decision.** (1) The session engine gains `advance: { auto: 'on-correct', holdMs }` (wait-mode), attempts,
a streak, and "mark as played" (the escape hatch: no step can trap the player). A right attempt in
wait-mode completes its hold even when the deck is not auto-playing. (2) The listener judges the step's
expectation (a chord when the shown marks have at most one per string, a single note for one mark; whole
scales are not judged). In single-note mode a strum (onsets within 130 ms) is ignored, so the
string-by-string check only counts single strings. (3) Tab play-along: with Listen on, playback keeps time
silently (the count-in still clicks) because self-masking would otherwise hide the player's notes that
coincide with the app's; continuous play uses a **timeline** of expected beats on the listener's clock —
each onset is matched to the nearest unjudged beat within ±180 ms and reported with its timing error;
wait-mode steps note by note. (4) Every judged attempt goes to the local `events` table as an
`AttemptEvent`. (5) Feedback: one coach line (wrong note > missing > ringing silent string > weak > streak),
green/amber rings on the judged dots, an end-of-run summary, a quiet chime on a clean chord. (6) "What am I
playing?" shows the smoothed top chroma guess and alternatives, with a library link.
**Alternatives.** Spectral subtraction of the app's own playback (needs the room's transfer function);
judging continuous tab play with a moving single expectation (verdicts were cancelled by the next beat).

## D-033 · 2026-11-26 · Field test of 0.5.0: NeckNet in its own worker; listening on CAGED cards
**Context.** Owner, 0.5.0: the overlay tracked well on the scale but lost the neck easily while playing
G major in the CAGED shapes, and listening said nothing. Diagnostics: 0 listening verdicts; tracking at
~4.5 updates/s (105 ms per frame; 0.3.8 managed ~15/s); half of all time in ~480 ms freezes, once a
second; the listener worker at 20–25 % of a core; before each loss the grid's nut end jumped ~100 px
between frames while the 12th-fret end held (the fretting hand at frets 1–3 covers the nut end).
**Decision.** (1) The watchdog's NeckNet check (~200 ms here, ~350 ms on the owner's laptop) and the
re-find while recovering ran inline in the tracking worker, so each one froze tracking. They now run in a
second worker (`detect.worker.ts`); the core queues the request, keeps tracking, and applies the answer
against the frame it was asked about (re-finds only if still recovering). Replay of the owner's frames:
worst frame 355 → 60 ms, mean 57 → 33 ms, locked throughout. Without nested workers it runs inline as
before. (2) Listening judged nothing on CAGED cards because "All shapes" (on by default) handed it every
shape's 19 notes; it now always checks the highlighted shape. The message for cards that cannot be
judged says to press Next for a single shape. (3) The resampler tabulates its kernel (3.7 → 0.8 % of a
core here); the level meter re-renders only itself, 5 times a second, instead of the whole Stage.
**Open.** The nut-end instability with the hand near the nut was not in the 10 s of video the export
holds; it is asked for in the next field test. `stage: track-motion` e2e fails 1 in 4 runs under load on
unchanged code too (pre-existing).

## D-034 · 2026-11-26 · Field test of 0.5.1: listening sees noise on most strums; opt-in audio in diagnostics
**Context.** Owner: "tracking is better and listening is decent". Diagnostics: tracking 8.7–9.1 updates/s
(was 4.5), NeckNet freezes 1.8 % of the time (was 51 %), listener 4.9 % of a core (was 20–25 %), two losses
in ~160 s. Listening: 105 chord verdicts, 9 passed. The fails were not near misses: on most, every judged
string scored 0.3–0.6 of the threshold (noise level), while the passes scored 3–30 — no sustained chord in
the analysis window. Likely causes: the browser or Windows still processing the microphone (noise
suppression or voice clarity removing a ringing chord after its attack), very short strums, or the
window landing late. The export holds no audio, so they cannot be told apart.
**Decision.** (1) Field test gains "Include microphone audio (last 10 s)", off by default, in memory only,
deleted when switched off, exported as a 16-bit WAV at ≤ 24 kHz (same policy as camera video; CLAUDE.md
rule 1 allows it on the player's export). The export also records what the browser reports about the mic
track (echo cancellation, noise suppression, auto gain) and, per strum, the analysed RMS, plucks heard and
strum length. (2) A strum where nothing of the chord came through is no longer blamed on a string or
counted as a wrong attempt: the coach says it did not catch the strum and points at the microphone check.
