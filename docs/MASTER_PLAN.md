# Fretlume — Master Build Plan

*Working name "Fretlume" (one constant, `APP_NAME`; rename freely). Plan version 1.0, 2026-11-16.*

**Mission.** A free, offline, open-source app that draws chords, scales, triads, keys, tabs and
lessons *on the player's real guitar* through any camera — functionally on par with the reference
app (see `research/01-product-teardown.md`) — and then goes beyond it: it listens, it watches the
fretting hand, it teaches a structured curriculum, and it adapts to the player.

**Hard constraints from the product owner**
1. Free to use and fully offline after the first load. No accounts, no servers, no telemetry.
2. The owner writes no code, labels no data, trains no model, prepares no assets. Every step must be
   executable by a coding agent in a CPU-only cloud container. (What the owner *is* asked to do is
   listed in §9 — it is clicks and playing guitar, nothing else.)
3. Original product: own name, look, wording and content.

---

## 1. Product scope

### 1.1 Parity layer (must match the reference app)
P-F1 live overlay on the real neck · P-F2 lock / re-lock / flip strings / overlay size ·
P-F3 floating deck with Start/Restart/Loop/Back/Next/Auto-advance · P-F4 library of chords, scales,
triads, keys with search · P-F5 notes / intervals / fingers labels · P-F6 CAGED shapes and positions,
colour by shape or by note · P-F7 triads by string set and inversion · P-F8 keys with diatonic chords and
harmonic roles · P-F9 acoustic / electric neck profiles · P-F10 custom practice runs (build, save,
reopen, step through) · P-F11 chromatic tuner with reference tones · P-F12 tab editor + import +
play-along on the neck · P-F13 lessons + playground + how-to guides · P-F14 left-handed mode ·
P-F15 local data with backup/restore.

### 1.2 Beyond layer (the reason this app exists)
B1 **Listening engine** — note / chord / timing verification, per-string diagnosis, wait-mode, scoring.
B2 **Hand vision** — fingertip → (string, fret), wrong-finger / wrong-string hints, fused with audio.
B3 **Curriculum** — tracks, lessons, drills, mastery gates, public-domain songs.
B4 **Personalisation** — placement, adaptive tempo, spaced repetition (FSRS), weakness analytics,
    daily plan, scaffold fading, goals and streaks.
B5 **Jam & create** — backing-track generator, scale-per-chord overlay over a progression, looper,
    clip recording, ear and fretboard games.
B6 **Reach** — PWA on desktop + tablet + phone; capo, alternate tunings, 7-string, bass, ukulele.
B7 **Trust** — auto-lock *and* always-works manual lock; continuous tracking; diagnostics bundle.

### 1.3 Non-goals (v1)
Copyrighted song catalogue; cloud sync; social features; an LLM coach; native App Store / Play Store
listings (they cost money and need the owner's accounts); teaching strumming-hand technique by vision.

---

## 2. Architecture decisions (ADRs)

| # | Decision | Why |
|---|---|---|
| A1 | **PWA first**: TypeScript (strict) + React + Vite + `vite-plugin-pwa`. Hosted free on GitHub Pages (HTTPS → camera works), installable, 100 % offline after first load. Optional Tauri / Capacitor wrappers in Phase 12. | Free distribution with no store fee or code-signing; one codebase for every OS (the reference app is desktop-only); and the whole thing is buildable **and testable** inside the cloud container (spike S1). Native iOS/Mac builds are impossible there. |
| A2 | **Vision = lock, then track.** Per-frame tracking is a classical model-based registration ("EdgeTracker", spike S4). Neural nets are used only to *find* the neck at lock time. A manual 4-tap lock always exists. | Measured: tracker reaches ~2 % of a fret with no learning. Keeps the real-time path free of sim-to-real risk; the risky learned part is confined to a step that has a manual fallback. |
| A3 | **Synthetic-only training.** Procedural generator → NeckNet (and, only if a gate requires it, StripNet). Real images are for evaluation only (small agent-labelled golden set + owner field tests). | No public keypoint dataset exists; the owner must not label data; GuiFiR (2026) shows synthetic composites work for this task. |
| A4 | **Audio verification is expectation-driven.** We always know what should sound, so we *verify* expected notes (harmonic-comb salience per expected pitch) instead of blind polyphonic transcription. Monophonic pitch via MPM/YIN in an AudioWorklet. | Far more reliable than transcription, needs no trained model, and yields per-string diagnosis. |
| A5 | **Content is generated, not scraped.** A typed music-theory engine generates chords, scales, CAGED positions, triads and keys; lessons/songs are authored as data by the agent; songs are public-domain or user-imported files. | Free, offline, legally clean, testable against known reference shapes. |
| A6 | **Local-first data.** IndexedDB (Dexie); versioned JSON backup file; zero network requests at runtime (enforced by an e2e test). | Privacy promise + offline. |
| A7 | **Hands: MediaPipe Hand Landmarker (Apache-2.0), self-hosted**, advisory only, always fused with audio. | Known imperfect on fretting grips; must never be the sole judge. |
| A8 | **Heavy work off the main thread.** Camera → Worker (EdgeTracker + hands) → latest pose → overlay canvas at display rate with prediction. NeckNet runs only during lock, single-thread WASM is fine → no COOP/COEP requirement on GitHub Pages. | Smooth UI; avoids the cross-origin-isolation trap found in spike S1. |
| A9 | **Dependencies must be permissive** (MIT, BSD, ISC, Apache-2.0, MPL-2.0, CC0) and vendored into the bundle (no CDNs). App licence: MIT unless the owner says otherwise. | Offline + redistributable. |
| A10 | **One repo, three top-level parts:** `app/` (PWA), `ml/` (Python synth/train/export/eval), `tools/` (fixtures, benches, golden-set labelling). | Simple for an agent to navigate. |

Stack summary: Node 22 + npm · React 19 · Zustand · Dexie · Vitest · Playwright · Canvas2D overlay ·
`@mediapipe/tasks-vision` · `onnxruntime-web` · `@coderline/alphatab` (tab import) · `ts-fsrs` ·
`minisearch` · Python 3.11+ with numpy, opencv-python-headless, torch (CPU), onnx, onnxruntime.

Target layout:
```
app/src/core/theory      pure TS: notes, intervals, tunings, chords, scales, CAGED, triads, keys
app/src/core/guitar      parametric instrument geometry (mm), profiles
app/src/vision           camera, homography, edgeTracker, neckNet, lock state machine, hands (Worker)
app/src/audio            worklets, pitch, onsets, chord verification, synth, metronome
app/src/overlay          canvas renderer for the neck overlay + flat diagrams
app/src/learn            lesson engine, mastery, FSRS scheduling, planner, analytics
app/src/content          library seeds, lessons, songs (data)
app/src/features/*       screens: home, stage, library, practice, tabs, learn, tools, progress, settings
app/src/storage          Dexie schema, migrations, backup
app/public/models        necknet.onnx, hand_landmarker.task (+ wasm runtimes)
ml/synth ml/train ml/export ml/eval
tools/fixtures tools/golden tools/bench
docs/…                   this plan
```

---

## 3. System overview

```
Camera ──► frame (≤1280×720) ──► [Vision Worker]
                                   ├─ Lock:  NeckNet (coarse) → multi-start EdgeTracker → index check
                                   │         or manual 4-tap → EdgeTracker snap
                                   ├─ Track: predict → EdgeTracker (1–2 iters) → One-Euro filter → pose H
                                   └─ Hands: MediaPipe landmarks → H⁻¹ → (string, fret) per fingertip
Microphone ─► [AudioWorklet] ─► pitch (MPM) · onsets · expected-note salience ─► note/chord/timing events
                     pose H, hand cells, audio events
                                   ▼
                     [Session engine]  (what should be played now? was it? when?)
                                   ▼
        Overlay renderer (dots/labels on the neck) · Deck panel · Feedback · Scoring
                                   ▼
        Learner model (mastery, FSRS, analytics) ─► next item / tempo / daily plan
```

Specs: `specs/01-vision.md`, `02-audio.md`, `03-theory-content.md`, `04-learning.md`,
`05-ux.md`, `06-testing-and-data.md`.

---

## 4. Quality bars (release gates)

| Area | Metric | Gate |
|---|---|---|
| Tracking accuracy (synthetic bench) | worst-fret along error / across error, median | ≤ 0.05 fret / ≤ 0.15 string |
| Tracking robustness | frames with error under (0.25 fret, 0.35 string) on tracking sequences with a fretting hand | ≥ 98 % |
| Overlay jitter (static scene) | RMS of projected dot position | ≤ 0.7 px at 720p |
| Auto-lock (synthetic, standard framing) | correct lock within 2 s | ≥ 95 % |
| Auto-lock (real golden set) | correct lock | ≥ 85 % (else UI steers to manual lock; never a silent wrong lock) |
| Wrong-fret-index locks | on synthetic set with visible nut | ≤ 1 % |
| Frame rate | desktop integrated GPU / mid-range phone | ≥ 30 fps / ≥ 20 fps (field-verified) |
| Tuner | error on synthesized tones / stable reading time | ≤ 1 cent / ≤ 150 ms |
| Mono note verification | F1 on synthesized + augmented corpus | ≥ 0.97 |
| Chord verification | accuracy on synthesized strums, false-fail rate | ≥ 0.92, ≤ 5 % |
| Offline | external requests during a full e2e run | 0 |
| Size | first-load transfer | ≤ 40 MB |
| Theory engine | unit tests against reference shapes | 100 % pass |
| Accessibility | keyboard operable, colour-blind-safe palettes, WCAG AA contrast on UI chrome | pass |

---

## 5. Phases

Each phase has its own file in `docs/phases/` with tasks, file-level guidance, acceptance tests and a
fallback ladder. A phase ends with green CI, an updated `docs/STATE.md`, a tagged release deployed to
GitHub Pages, and (where marked 🎸) a 10-minute owner field test.

| Phase | Title | Outcome | Release |
|---|---|---|---|
| 0 | Bootstrap & guardrails | Repo, CI, deploy, fake-camera/mic test harness, design tokens | v0.0 |
| 1 | Theory engine & diagrams | Chords, scales, CAGED, triads, keys as tested pure TS + SVG fretboard component | — |
| 2 | App shell, Library, Tuner | Installable offline PWA: library browser, search, tuner, metronome, settings, backup | v0.1 |
| 3 | Camera overlay with manual lock | 4-tap lock → EdgeTracker tracking → overlay + deck on the real neck | v0.2 🎸 |
| 4 | Synthetic data & auto-lock | Generator, NeckNet, automatic lock, fret-index check, guitar profiles | v0.3 🎸 |
| 5 | Practice runs, playground, tabs | Run builder, tab editor/import, play-along on the neck → **reference-app parity** | v0.4 |
| 6 | Listening engine | Note/chord/timing verification, per-string check, wait-mode, scoring | v0.5 🎸 |
| 7 | Hand vision & fusion | Fingertip cells, finger hints, audio+vision fusion, occlusion-aware tracking | v0.6 🎸 |
| 8 | Curriculum & songs | Lesson engine, 5 tracks (~70 lessons), public-domain songs, mastery gates | v0.7 |
| 9 | Personalisation | Placement, FSRS, adaptive tempo, analytics, daily plan, scaffold fading, progress | v0.8 🎸 |
| 10 | Jam & creative tools | Backing tracks, progression mode, looper, recording, games | v0.9 |
| 11 | Performance, robustness, access, mobile | Budgets met on low-end devices, phone/tablet UX, a11y, diagnostics loop | v0.10 🎸 |
| 12 | Packaging & 1.0 | Install polish, optional desktop/Android wrappers via CI, docs site, licence audit | **v1.0** |

Dependency notes: 1 → 2 → 3 is strictly sequential. 4 and 5 are independent of each other (5 can ship
before 4 if 4 stalls — manual lock keeps the product usable). 6 and 7 are independent; 8 needs 6; 9 needs
8; 10 needs 6; 11–12 last. **Parity is reached at the end of Phase 5; every later phase is "beyond".**

Rough size: 13 phases ≈ 25–40 agent sessions.

---

## 6. Risk register

| # | Risk | Likelihood | Mitigation (already designed in) |
|---|---|---|---|
| R1 | Synthetic-trained NeckNet fails on real guitars | Medium | It only seeds the lock. Manual 4-tap lock ships first (Phase 3) and always remains. Rich domain randomisation; golden real set; owner field test; diagnostics bundle feeds failures back. |
| R2 | Lock picks the wrong fret index (self-similar comb, spike S4) | Medium | Nut-anchored index; inlay-pattern check; lock confirmation shows fret numbers on the neck; one-tap "shift ±1 fret"; index frozen while tracking. |
| R3 | Tracker loses the neck under the fretting hand / motion blur | Medium | Median-over-rows evidence, IRLS, hand-mask exclusion (Phase 7), prediction + confidence + fast re-lock from the last pose; "hold still" hint only when confidence drops. |
| R4 | Hand tracker inaccurate on fretting grips | High | Advisory only; audio is the judge; hints need agreement over several frames; can be switched off. |
| R5 | Chord verification false fails annoy users | Medium | Expectation-driven; lenient default; per-string arpeggio check; calibration of input level/noise; always a "mark as played" escape hatch. |
| R6 | CPU-only training too slow / session dies mid-run | Low | 300 k img/h measured; resumable chunks; alternative GitHub Actions training workflow that commits the model. |
| R7 | Performance on phones | Medium | Worker pipeline, strip-only processing, hands at reduced rate, quality tiers, WebGPU where available. |
| R8 | Container is ephemeral; work lost | High if ignored | Commit + push after every green step; `docs/STATE.md` is the single source of truth for resuming. |
| R9 | iOS Safari quirks (camera in installed PWA, audio latency) | Medium | Feature-detect; documented limits; tested in Phase 11 via owner field test. |
| R10 | Scope creep stalls parity | Medium | Parity (Phases 0–5) is frozen scope; "beyond" features only after v0.4. |

---

## 7. How the agent works (summary; full rules in `CLAUDE.md`)

1. Read `docs/STATE.md` → open the current phase file → read only the specs it references.
2. Work task by task. Every task has machine-checkable acceptance criteria. Run `npm run verify`.
3. Commit and push after each green task. Update `STATE.md` (done / next / decisions / blockers).
4. Look at your own output: screenshot the app with Playwright and inspect the image.
5. If a gate fails, walk the phase's fallback ladder; log the decision in `docs/DECISIONS.md`.
6. Never hand work to the owner. Allowed requests are listed in §9.

## 8. Handoff prompts
See `docs/KICKOFF_PROMPTS.md`. The standing prompt for every session is:
> Continue building Fretlume. Read `CLAUDE.md` and `docs/STATE.md`, then carry on with the next task.

## 9. What the owner does (complete list)
1. **Once:** create an empty GitHub repository and attach it to the session (or tell the agent its name).
2. **When prompted:** approve environment / network-access prompts (one click each).
3. **Possibly once:** in the repo, Settings → Pages → Source = "GitHub Actions" (only if the automatic
   enablement in Phase 0 is refused).
4. **At 🎸 checkpoints (optional but valuable):** open the app, play for ten minutes, press
   *Export diagnostics*, drop the file into the chat, and say what felt wrong.
5. **Decisions:** name, licence, and priorities when the plan flags `OWNER DECISION`.
