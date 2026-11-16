# Phase 0 — Bootstrap & guardrails

**Goal.** A repo where every later phase can be built, tested end-to-end with a fake camera and
microphone, and shipped — before any feature exists.
**Read first:** `CLAUDE.md`, `MASTER_PLAN.md` §2, `specs/06-testing-and-data.md` §1, §6, `research/02-spike-results.md` §S1–S2.
**Sessions:** 1–2.

## Tasks
- [x] **0.1 Repo.** If no repository is attached, ask the owner for one (see `STATE.md` → Session bootstrap).
      Commit the existing `docs/`, `spikes/`, `CLAUDE.md`. Add `LICENSE` (MIT, `OWNER DECISION` to change),
      `.gitignore`, `.editorconfig`, `docs/DECISIONS.md`, `docs/THIRD_PARTY.md`.
- [x] **0.2 App scaffold.** `app/`: Vite + React + TypeScript strict; ESLint + Prettier; path aliases
      (`@core`, `@vision`, `@audio`, `@ui`, …); folder skeleton from `MASTER_PLAN.md` §2; `APP_NAME` constant;
      i18n module with `en.ts`; router with empty screens for the seven nav destinations.
- [x] **0.3 PWA.** `vite-plugin-pwa` (generateSW, precache everything in `dist`, including `public/models`
      later), manifest (name, icons generated from an SVG mark you draw — original), offline fallback,
      "update available" toast. `base` configurable for GitHub Pages.
- [x] **0.4 Design system seed.** Tokens from `specs/05-ux.md` §1, dark/light themes, primitives: Button,
      IconButton, Chip, Tabs, Card, Dialog, Toast, Slider, Toggle. A `/dev/kitchen-sink` route.
- [x] **0.5 Test harness.** Vitest; Playwright config with a `fake-media` project that launches Chromium
      with the fake-device flags and per-test video/audio files (helper `useFakeMedia({ video, audio })`
      that relaunches the context); a `/dev/media-probe` route that reports frame size and dominant audio
      frequency; e2e `media-probe.spec.ts` (port of `spikes/browser_harness`) and `offline.spec.ts`.
- [x] **0.6 Fixtures tooling.** `tools/fixtures`: ffmpeg wrappers to turn PNG frame sequences into `.mjpeg`
      /`.y4m`, and float arrays into WAV. `npm run fixtures` produces a colour-bars clip and a 110 Hz tone
      for the probe test. Python env managed by `uv` under `ml/` (`pyproject.toml`: numpy, opencv-python-headless).
- [x] **0.7 Environment.** Call the environment tools: if a personal environment for this repo does not
      exist, propose one (named after the repo) with a setup script that runs `npm ci` in `app/` and
      `uv sync` in `ml/` when those folders exist. Hosts: only what has been needed so far. (Wikimedia /
      Zenodo are proposed later, in Phase 4/6, when the task that needs them starts.)
- [x] **0.8 CI/CD.** `ci.yml` (verify), `deploy.yml` (tag → GitHub Pages via `actions/deploy-pages`).
      Try automatic Pages enablement; if the first deploy fails with "Pages not enabled", ask the owner
      for the single click (MASTER_PLAN §9.3) and continue with other work meanwhile.
- [x] **0.9 Scripts.** `npm run dev|verify|test:e2e|fixtures|build` wired at the repo root.
- [x] **0.10 `STATE.md`** updated; tag `v0.0`.

## Result (2026-11-16)
| Gate | Result |
|---|---|
| 1. `npm run verify` green | Locally: yes (typecheck, lint, 12 unit tests, 8 browser tests). CI: workflow pushed; its result cannot be read from the build session — check the repository's Actions tab. |
| 2. Fake camera + microphone | Pass: 1280×720 frames from `bars-720p.mjpeg`; loudest frequency within 2 Hz of 110 Hz from `tone-110hz.wav`. |
| 3. Offline, no external requests | Pass on the production build, including a cold start while offline; also checked by hand under the `/fretlume/` sub-path used on GitHub Pages. |
| 4. Installable PWA + screenshots | Manifest, icons and service worker served and tested locally; screenshots in `docs/screens/phase-0/`. Live install check waits for the first Pages deploy (Release workflow, version 0.0.0). |

Deviations: fixtures are Motion-JPEG rather than `.y4m` (DECISIONS D-005); `/dev/*` routes are hash routes
(`/#/dev/kitchen-sink`, `/#/dev/media-probe`) (D-004); tags are created by the Release workflow because the
session cannot push them (D-008).

## Acceptance (exit gate)
1. `npm run verify` is green locally and in CI.
2. `media-probe.spec.ts` proves: 1280×720 frames from a fixture video, dominant audio frequency 110 ± 2 Hz.
3. `offline.spec.ts` proves the built app reloads offline and makes zero external requests.
4. The deployed (or locally previewed, if Pages is pending) build installs as a PWA; screenshot of the
   kitchen sink in dark and light themes inspected and saved to `docs/screens/phase-0/`.

## Fallback ladder
- Playwright version mismatch → launch with `executablePath: '/opt/pw-browsers/chromium'`.
- `.y4m` too large for git → generate at test time; commit only the generator and seeds.
- GitHub Pages unavailable → keep `deploy.yml`, ship via `npm run build` + downloadable `dist.zip`
  release artifact until the owner enables Pages.
