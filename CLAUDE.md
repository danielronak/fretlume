# Fretlume — operating manual for the build agent

You are building Fretlume: a free, offline PWA that overlays guitar learning material on the
player's real guitar through the camera, listens to the playing, and teaches adaptively.
The product owner does **no** coding, labelling, training or asset preparation.

## Start of every session
1. Read `docs/STATE.md` (where we are, what is next, open blockers).
2. Open the current phase file in `docs/phases/`. Read only the specs it lists under **Read first**.
3. If the repo is not cloned / not attached, follow "Session bootstrap" in `docs/STATE.md`.
4. Continue with the next unchecked task. Do not re-plan finished phases.

## Working rules
- **Small verified steps.** Implement one task, run `npm run verify` (typecheck + lint + unit + e2e smoke),
  fix, commit, push. The container is ephemeral — unpushed work is lost. Push at least every hour.
- **Update `docs/STATE.md`** whenever a task completes, a decision is made, or a blocker appears.
  Record non-obvious decisions in `docs/DECISIONS.md` (date, context, decision, alternatives).
- **Acceptance criteria are the definition of done.** Each task lists them. If a criterion is wrong or
  impossible, say why in `DECISIONS.md` and replace it with an equally testable one — never delete it silently.
- **Gates.** A phase is complete only when its exit gate passes. When a gate fails after two honest
  attempts, follow that phase's *Fallback ladder* in order. Never mark a failing gate as passed; record
  the measured number.
- **Look at what you built.** For any UI or overlay change, drive the app with Playwright, save a
  screenshot (deviceScaleFactor 1 for your own checks) and inspect the image. For vision work, render
  the estimated overlay on the test frame and look at it.
- **Tests first for pure logic** (`core/theory`, `core/guitar`, geometry, DSP, scheduling). Property
  tests where a law exists (e.g. transposition invariance, homography round-trips).
- **Performance numbers measured in the container are not real** (software GL, 4 vCPU). Enforce
  algorithmic budgets (operations per frame, strip size) and relative regressions; absolute fps is
  confirmed in owner field tests.

## Never ask the owner to
write or edit code · label images · record datasets · run training · install toolchains · edit config files.
**You may ask for:** approval of an environment/network prompt; attaching a repo; a single settings click that
no tool can perform; an optional 🎸 field test + diagnostics file; decisions marked `OWNER DECISION`.
When a field test is optional, keep working on the next task while waiting.

## Hard product rules
1. **Offline & private.** Zero network requests at runtime after the service worker has cached the app
   (e2e test `offline.spec.ts` blocks all non-localhost requests and must stay green). No analytics, no CDNs,
   no remote fonts. Camera frames and audio never leave the device and are never stored unless the user
   presses Record / Export diagnostics.
2. **Free.** No paywalls, no accounts, no keys.
3. **Originality.** Functionally comparable to the reference app, but nothing of theirs is reused: not the
   name, logo, wording, screenshots, colour scheme or brushed-metal look. Do not download their assets
   into the repo. Our visual identity is defined in `docs/specs/05-ux.md`.
4. **Content legality.** Only public-domain compositions (with our own arrangements) or user-imported
   files. No copyrighted songs, tabs or lyrics in the repo.
5. **Licences.** New dependencies must be MIT/BSD/ISC/Apache-2.0/MPL-2.0/CC0 and vendored (no CDN).
   Record each in `docs/THIRD_PARTY.md` with version and licence.
6. **Honesty in the UI.** Never show a lock that is not verified; when confidence is low say so and offer
   manual lock. Never fail the player on vision alone.

## Environment facts (verified 2026-11-16, see `docs/research/02-spike-results.md`)
- Container: 4 vCPU, 15 GB RAM, no GPU, Node 22, Python 3.13, ffmpeg, Java. Use `uv` for Python envs.
- Chromium + Playwright 1.63 are pre-installed. **Do not run `playwright install`.** Pin
  `@playwright/test` to the installed version or launch with `executablePath: '/opt/pw-browsers/chromium'`.
  Run suites with `--trace off`.
- Fake devices for e2e: `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream
  --use-file-for-fake-video-capture=<.y4m|.mjpeg> --use-file-for-fake-audio-capture=<.wav>`.
  Use the `mediaPage` fixture in `app/e2e/fixtures.ts` (`test.use({ fakeMedia: { video, audio } })`);
  fixture files live in `fixtures/generated/` and are produced by `npm run fixtures` (prefer `.mjpeg`).
- E2E runs against the production build (`vite preview` on port 4173). Routes are hash routes: `/#/library`.
- TypeScript is pinned to 6.0.x (DECISIONS D-002). Vitest component tests opt in to a DOM with
  `// @vitest-environment happy-dom` on the first line.
- Workflow results (CI, deploy) cannot be read from the session; ask the owner to glance at the Actions tab.
- Reachable hosts: npm, PyPI, apt mirrors, `storage.googleapis.com`, `raw.githubusercontent.com`.
  Blocked: huggingface, zenodo, wikimedia, pexels, pytorch.org, GitHub release downloads. If a task
  truly needs a blocked host, propose the smallest environment change once, with the evidence.
- `pip install torch` from PyPI gives the CUDA build (≈5.7 GB) and runs fine on CPU.
- Long jobs: run in the background in resumable ≤100-minute chunks with checkpoints; commit checkpoints
  that matter. Alternative: the `train.yml` GitHub Actions workflow (Phase 4).
- Commit messages and PR text must not contain any AI model identifier.

## Commands (created in Phase 0; keep them working)
```bash
npm run dev            # Vite dev server
npm run verify         # typecheck + eslint/prettier + vitest + playwright tests tagged @smoke
npm run test           # vitest only
npm run test:e2e       # full Playwright suite with fake camera/mic fixtures
npm run format         # prettier --write
npm run icons          # re-rasterise app/public/icons from mark.svg
npm run fixtures       # (re)generate synthetic video/audio fixtures into fixtures/
npm run bench:vision   # tracking/lock benchmark → docs/benchmarks/*.json
npm run bench:audio    # audio verification benchmark
npm run build          # production PWA into app/dist
```

## Style
TypeScript strict, no `any` in `core/`. Pure functions in `core/` (no DOM, no globals). Units in names
(`xMm`, `tMs`, `fHz`, `cents`). Board coordinates are millimetres (see `specs/01-vision.md` §1). Strings are
numbered 1 (high e) … 6 (low E) as guitarists do; array index = string − 1. Frets are integers, 0 = open.
UI text lives in `app/src/i18n/en.ts` — no hard-coded strings in components.
