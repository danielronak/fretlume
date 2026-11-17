# STATE — single source of truth for resuming work

*Update this file whenever a task completes, a decision is made, or a blocker appears.*

## Now
- **Current phase:** 3 — Camera overlay with manual lock (`docs/phases/phase-03-camera-manual-lock.md`)
- **Next task:** Phase 4 (`docs/phases/phase-04-*.md`) — synthetic data + auto-lock. Carry over from Phase 3: G3.2 at σ 5 px, the G3.3 index slip, G3.4 jitter, index verification (nut/inlays) during recovery (D-016–D-018).
- **Last release:** 0.2.0 (Phase 3), 2026-11-17 — deploys once GitHub Pages is enabled (see below)
- **Repository:** `danielronak/fretlume`, default branch `main`, trunk-based (DECISIONS D-001)
- **Cloud environment:** `fretlume` (personal; setup script runs `npm ci` + `uv sync`).
- **Last updated:** 2026-11-17

## Waiting on the owner (does not block building)
- **🎸 Optional field test of 0.2.0 (10 minutes).** Once the app is live (Pages, below) or with `npm run dev`
  on a laptop: open Settings → Field test and follow the eight steps (lock in good and dim light, play
  with the overlay, move the guitar, re-lock, tune), then *Export diagnostics* and attach the file to the
  next session. Switching on "Include camera frames" first makes the file much more useful.
- **Switch on GitHub Pages (one click):** repository Settings → Pages → Source = **GitHub Actions**, then
  re-run the failed "Release" run in the Actions tab. The Release workflow failed on 2026-11-16 with
  "Create Pages site failed: Resource not accessible by integration", and the session's proxy refuses the
  Pages API, so only the owner can do this. Afterwards the app is live at
  `https://danielronak.github.io/fretlume/`.

## CI status
Check with `gh run list --repo danielronak/fretlume --limit 3`; every push so far has gone green.

## How to release (DECISIONS D-008)
Bump `version` in the root `package.json` (and `APP_VERSION` in `app/src/config.ts`) in a commit on `main`.
The "Release" workflow deploys it and creates the tag. The session cannot push tags itself.

## Session bootstrap (do this first in a new session)
1. Is a Fretlume repository attached to the session and cloned?
   - Yes → `cd` into it, `git pull`, read on.
   - No → ask the owner once: "Please create an empty GitHub repository (suggested name `fretlume`) and
     tell me its name, or attach it to this session." Then add it with push access and clone it.
     Then put the plan into it, from the first source that works:
     a. `/home/user/fretlume` if this container still has it from the planning session;
     b. the published plan artifact https://claude.ai/artifact/5bxogPgjSBccJHwsNQz1Sc — list its files
        (Artifact `action: list`, `scope: files`) and read them all with `paths` (every plan file is
        published there at its repo-relative path; `spikes/browser_harness/index.html` is stored as
        `index.html.txt`);
     c. `fretlume-plan.tar.gz`, which the owner received on 2026-11-16 and can re-attach.
2. Check the environment (`get_environment`); Phase 0 task 0.7 covers creating a dedicated one.
3. Run `npm run verify` once it exists to confirm a green baseline before changing anything.

## Phase board
| Phase | Status | Release | Gate numbers / notes |
|---|---|---|---|
| 0 Bootstrap | **done** 2026-11-16 | v0.0 | verify green locally and in CI (12 unit, 8 browser tests); first Pages deploy waits for the owner to enable Pages |
| 1 Theory engine | **done** 2026-11-16 | — | 218 tests; core line coverage 99.2 %; fingering agreement 91.3 %; `docs/benchmarks/catalogue.json` |
| 2 Shell, Library, Tuner | **done** 2026-11-17 | v0.1 (0.1.0) | G6.1 18/18 within 1 cent; first load 1.41 MB; 283 unit + 29 smoke e2e |
| 3 Camera + manual lock | **done** 2026-11-17, 3 gates failing (recorded) | v0.2 (0.2.0) 🎸 | G3.1 pass; G3.2 91.5 % σ5 / 91.5 % σ8 with 6 taps (fail σ5, D-016); G3.3 98.2 % frames, 1 slip in 60 (fail); G3.4 1.05 px (fail); G3.5 pass; e2e 60/60 |
| 4 Synthetic + auto-lock | not started | v0.3 🎸 | |
| 5 Runs, playground, tabs (parity) | not started | v0.4 | |
| 6 Listening | not started | v0.5 🎸 | |
| 7 Hand vision | not started | v0.6 🎸 | |
| 8 Curriculum & songs | not started | v0.7 | |
| 9 Personalisation | not started | v0.8 🎸 | |
| 10 Jam tools | not started | v0.9 | |
| 11 Perf / a11y / mobile | not started | v0.10 🎸 | |
| 12 Release | not started | v1.0 | |

## Done in Phase 3 (2026-11-17)
- `ml/synth`: synthetic guitar frames and clips (boards, inlays, strings with shadows, hand, camera
  effects, hold/ping-pong clips); `npm run fixtures` renders the seven e2e camera clips.
- `app/src/vision`: geometry kernel, EdgeTracker (parity + improved), lock snapping (`lock.ts`), tracking
  session with One-Euro filter (`tracking.ts`), worker (`vision.worker.ts`, logic in `core.ts`).
- `app/src/camera`: camera manager, frame pump with quality tiers (`visionClient.ts`).
- `app/src/overlay/projection.ts` + `features/stage/` (Stage screen, deck, drawing), "Open on my guitar"
  in the Library, field test + diagnostics (`features/fieldtest/`, `diagnostics/recorder.ts`).
- Benchmarks `npm run bench:vision` → `docs/benchmarks/vision-phase3.json`; screens `docs/screens/phase-3/`
  (regenerate with `node tools/screens/stage.mjs <dir>` against `vite preview`).

## Done in Phase 2 (2026-11-17)
- Settings store (`app/src/state/settings.ts`, localStorage, D-012) and three-step welcome.
- Dexie database (`app/src/storage/db.ts`), favourites/folders, zod-validated backup files, Settings screen.
- Library screens (`app/src/features/library/`): tabs, pickers, chips, voicing cards, keys, related links,
  favourites/folders/Saved, search, deep links `/#/library/<kind>/<root>/<type>` (roots: C, Fs, Bb …).
- Audio core (`app/src/audio/`): `audioEngine` (one AudioContext, unlock on gesture, suspend when hidden),
  capture worklet → `microphone` manager (ring buffer, blocks, permission states, devices, unplug), input
  meter on the Tools screen. Tuner (2.5) reads `microphone.ring` / `microphone.onBlock`.
- Tuner (`app/src/audio/dsp/mpm.ts` + `tuner.ts` + `useTuner.ts`, screen `features/tools/Tuner.tsx`), reference
  tones (`audio/player.ts`, Karplus–Strong `dsp/karplus.ts`), metronome (`audio/beats.ts`, `audio/metronome.ts`,
  `features/tools/MetronomeScreen.tsx`), Hear-it buttons in the library, help guides (`features/help/`).
- Short landscape screens use a side rail (`features/shell.css`). Screenshots: `docs/screens/phase-2/`.

## Done in Phase 1 (2026-11-16)
- `app/src/core/theory`: pitch/spelling, degrees, tunings + capo; 26 chord qualities, 80 authored voicings,
  moved CAGED forms, voicing generator, fingering inference, reverse lookup; 22 scales with CAGED,
  three-notes-per-string and whole-neck layouts; triads; arpeggios; intervals; note finder; keys,
  progressions, capo and chord-scale help; library catalogue (744 items) and descriptive search.
- `app/src/core/guitar`: instrument geometry in millimetres (used by the camera overlay in Phase 3).
- `app/src/overlay`: `FlatFretboard` SVG renderer (neck and chord-box layouts) and shared label/colour rules.
- Entry points for Phase 2: `searchLibrary`, `libraryCatalogue`, `chordVoicings` / `voicingToShape`,
  `cagedChordShape`, `scaleShape` / `scalePositionShape`, `triadShape`, `arpeggioShape`, `buildKey`,
  `<FlatFretboard shape layout labelMode colorMode activeGroups leftHanded />`. Contact sheet: `/#/dev/diagrams`.

## Done in Phase 0 (2026-11-16)
- npm workspace, `app/` (Vite 8, React 19, TypeScript 6 strict), ESLint, Prettier, path aliases, skeleton.
- Offline PWA (precache, manifest, original mark + icons, update-on-request toast).
- Design tokens (dark/light), nine UI primitives, navigation shell, seven placeholder screens, i18n.
- Test harness: Vitest; Playwright against the production build; `mediaPage` fixture for fake
  camera/microphone (`app/e2e/fixtures.ts`); `/#/dev/media-probe`; offline + no-external-request tests.
- `tools/fixtures` (ffmpeg wrappers, WAV writer), `ml/` Python env via `uv`.
- CI (`ci.yml`) and Pages deploy (`deploy.yml`); `fretlume` cloud environment.

## Done so far (planning session, 2026-11-16)
- Product teardown of the reference app and competitors → `docs/research/01-product-teardown.md`.
- Feasibility spikes S1–S4 → `docs/research/02-spike-results.md`; code in `spikes/`.
- Master plan, six specs, thirteen phase files, operating manual.

## Open owner decisions
| # | Decision | Default if no answer |
|---|---|---|
| D1 | App name ("Fretlume" is a working name; a quick web search found no guitar app with it) | Keep Fretlume |
| D2 | Licence | MIT |
| D3 | Repository visibility (public = unlimited free CI minutes and free GitHub Pages) | Public |
| D4 | Allow Wikimedia hosts for the real-image golden set (Phase 4) | Ask when Phase 4 starts |

## Blockers
- None.

## Field-test log (🎸)
*(empty — add date, device, findings, diagnostics file name, follow-up tasks)*

## Decisions log pointer
See `docs/DECISIONS.md` (created in Phase 0). Architecture decisions A1–A10 are in `MASTER_PLAN.md` §2.
