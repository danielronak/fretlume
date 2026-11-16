# STATE — single source of truth for resuming work

*Update this file whenever a task completes, a decision is made, or a blocker appears.*

## Now
- **Current phase:** 1 — Theory engine & diagrams (`docs/phases/phase-01-theory-engine.md`)
- **Next task:** 1.1 (pitch classes, MIDI, spelling, intervals, tunings, capo)
- **Repository:** `danielronak/fretlume`, default branch `main`, trunk-based (DECISIONS D-001)
- **Cloud environment:** `fretlume` (personal; setup script runs `npm ci` + `uv sync`). Created
  2026-11-16; the script was run by hand but is unproven until a fresh session starts on it.
- **Last updated:** 2026-11-16 (Phase 0 complete)

## Waiting on the owner (nothing here blocks Phase 1)
- **Check CI:** open the repository's *Actions* tab and confirm the "CI" run on `main` is green. The build
  session cannot read workflow results. If it is red, paste the failing step's log into the chat.
- **GitHub Pages:** the `v0.0` tag triggers the "Deploy" workflow. If it fails at "configure-pages" with
  "Pages not enabled", switch it on once: Settings → Pages → Source = **GitHub Actions**, then re-run the
  workflow. The app will then be live at `https://danielronak.github.io/fretlume/`.

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
| 0 Bootstrap | **done** 2026-11-16 | v0.0 | verify green locally (12 unit, 8 browser tests); CI and Pages results need an owner glance |
| 1 Theory engine | not started | — | |
| 2 Shell, Library, Tuner | not started | v0.1 | |
| 3 Camera + manual lock | not started | v0.2 🎸 | |
| 4 Synthetic + auto-lock | not started | v0.3 🎸 | |
| 5 Runs, playground, tabs (parity) | not started | v0.4 | |
| 6 Listening | not started | v0.5 🎸 | |
| 7 Hand vision | not started | v0.6 🎸 | |
| 8 Curriculum & songs | not started | v0.7 | |
| 9 Personalisation | not started | v0.8 🎸 | |
| 10 Jam tools | not started | v0.9 | |
| 11 Perf / a11y / mobile | not started | v0.10 🎸 | |
| 12 Release | not started | v1.0 | |

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
