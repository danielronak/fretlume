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
