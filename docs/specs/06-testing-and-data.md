# Spec 06 — Testing strategy, synthetic data and evaluation

Goal: the agent can prove every feature works without a human, a guitar, a GPU or a labelled dataset.

## 1. Test pyramid
| Layer | Tool | What |
|---|---|---|
| Unit | Vitest (Node) | theory engine, instrument geometry, homography math, EdgeTracker on image buffers, DSP on WAV buffers, scheduler/planner, importers, storage migrations |
| Property | fast-check | transposition invariance, enharmonic round-trips, `H` ↔ control points, planner invariants |
| Component | Vitest + Testing Library | diagram renderer, deck, editor keyboard handling |
| E2E | Playwright (Chromium, fake camera + fake mic) | lock, tracking, overlays, tuner, lessons with scripted players, offline mode, backup round-trip |
| Visual | Playwright screenshots + image inspection by the agent | every screen in dark/light, overlay on reference frames; golden screenshots with tolerance for diagrams |
| Bench | `tools/bench/*` | vision and audio gates → JSON in `docs/benchmarks/` + a markdown summary updated per phase |
| CI | GitHub Actions | verify on every push; nightly full bench; deploy on tag |

`offline.spec.ts`: after first load, `context.setOffline(true)`, reload, run a smoke path; separately,
`page.route('**', …)` fails the test on any non-localhost request.

## 2. Synthetic video generator (`ml/synth`, Python; shared by training, benches and e2e fixtures)
One generator, three consumers. Everything is seeded and parameterised by a JSON "scene spec".
**Geometry (ground truth is exact):** instrument model (spec 01 §2) → metric board texture → random
homography → frame, plus labels `{H, control points, visible mask, nut/inlay boxes, hand mask, index}`.

**Appearance families (hold some out per split):**
- Boards: rosewood, ebony, maple (light board → inverted wire polarity), pau ferro, richlite; gloss/matte;
  binding on/off; wear.
- Frets: count 12–24 drawn, wire width 1.6–3.0 mm, shine, specular breaks, tarnish; zero-fret option.
- Inlays: dots, offset dots, blocks, trapezoids, birds-style abstract blobs, none; side dots.
- Nut: bone/plastic/black/brass, width 3–6 mm; locking nut; capo object at fret 1–7 (labelled).
- Strings: steel plain/wound, nylon; 6 (later 4/7/12); slack/curved slightly; glints.
- Neck/headstock/body: 3+3 and 6-in-line headstocks with tuners, logos as abstract shapes; acoustic body
  with sound hole, electric bodies with pickups; body joint at fret 12/14/16+; cutaways.
- **Player:** torso behind the neck (plain/striped/printed clothing textures with fake text), arms,
  strumming hand over the body, **fretting hand** as an articulated procedural model (palm + 4 capsule
  fingers + thumb, several skin tones, rings/sleeves) posed on random cells or absent.
- Backgrounds: procedural rooms (walls, windows with bloom, furniture blocks, lamps), noise fields,
  hard-edged clutter, optionally a small set of CC0 photos if a host is allowed.
- Camera: 480p/720p/1080p; neck length 40–110 % of frame width (partly out of frame); roll ±35°;
  yaw/pitch up to 45°; mirrored or not; exposure, white balance, low light + sensor noise, motion blur
  along the motion vector, defocus, JPEG/H.264 artefacts, rolling-shutter skew, vignetting.
- **Sequences:** smooth pose trajectories (breathing sway, strumming shake, repositioning, guitar leaving
  frame and returning), hand moving between chord grips, lighting changes.

**Optional 3-D set** (`bpy` via `uv` with Python 3.11, Cycles CPU, low samples + denoise): a parametric
3-D guitar for true perspective, self-shadowing and specular realism. Use it for **validation split C**
(domain-gap check), and mix ≤ 20 % into training if G4.2 demands. Skip if `bpy` cannot be installed.

**Splits:** train (families A), val-A (same families, new seeds), val-B (held-out board/inlay/clothing
families), val-C (3-D or photo-composite), plus no-guitar negatives (rooms, people, other instruments
drawn procedurally: ukulele/violin-like shapes, keyboards, striped objects that mimic frets — fences,
radiators, blinds).

**Fixtures for e2e** (`npm run fixtures`): short `.mjpeg`/`.y4m` clips (lock-easy, lock-hard, track-hand,
track-motion, no-guitar, lefty, capo, low-light) + their label JSON; small ones are committed,
large ones regenerated deterministically.

## 3. Real "golden set" without owner effort (Phase 4, task 4.9)
Purpose: an honest sim-to-real number. Target ≥ 60 frames from ≥ 12 different guitars/rooms.
- **Sources (need one-time allowlist approval):** Wikimedia Commons images/videos of guitars being played
  (CC BY / CC BY-SA / PD — record author + licence per file in `tools/golden/ATTRIBUTION.md`; keep the set
  out of the app bundle; if licences forbid redistribution, store only URLs + labels and re-download).
- **Labelling by the agent:** `tools/golden/label.ts` — renders the frame with a coordinate grid, the agent
  proposes the four control points, the tool snaps with EdgeTracker, renders the fret grid + numbers over
  the image, the agent inspects the render (zoomed crops at nut, 5th, 12th fret) and accepts or adjusts.
  Two independent passes; keep frames where passes agree within 3 px.
- If no real source can be allowed: the gate is reported as "not measured", auto-lock ships as **beta**
  behind manual lock, and the owner's first field test supplies the frames (diagnostics bundle).

## 4. Owner field tests (🎸) and the diagnostics bundle
`Settings → Export diagnostics` writes a zip: 10–20 s of camera frames at reduced rate (only on explicit
consent, shown before saving), per-frame pose/confidence/state, lock attempts, device/browser info,
audio verdict logs (no raw audio unless ticked), app version. The agent replays it through the same
pipeline in the container (`tools/replay`) and adds failures to the regression set. A manual-lock
correction by the user is a free ground-truth label.

Field-test script (10 minutes, in the app as a checklist): lock in good light → lock in dim light →
play 3 chords and a scale with the overlay → move the guitar → re-lock → tuner on all strings →
(from Phase 6) chord check on G, C, D → export diagnostics.

## 5. Scripted players (for lessons and listening)
`tools/players`: given a session's step list, synthesize the audio a player would produce —
**perfect**, **sloppy-timing**, **one-muted-string**, **wrong-fret**, **slow-changes** — and (for vision)
a clip with the procedural hand on the right/wrong cells. These drive G6.x, G7.x, G8.2, G8.3.

## 6. CI and release
- `ci.yml`: install, `npm run verify`, upload Playwright report on failure.
- `bench.yml` (nightly + manual): full benches, commit JSON summaries to `docs/benchmarks/`.
- `deploy.yml` (on tag `v*`): build, deploy to GitHub Pages (base path = repo name).
- `train.yml` (manual or on push to `training/requests/*.json`): generate data, train on the Actions
  runner (CPU, ≤ 5.5 h, checkpoint artifacts), export ONNX, open a branch `models/<run-id>` with the
  model + metrics. Used when in-container training chunks are impractical.
