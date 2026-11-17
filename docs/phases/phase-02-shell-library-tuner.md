# Phase 2 — App shell, Library, Tuner (release v0.1)

**Goal.** A genuinely useful, installable, offline app without the camera: browse and search the
library, tune the guitar, use a metronome, keep favourites, back up data.
**Read first:** `specs/05-ux.md` §1–§2, §6–§8; `specs/02-audio.md` §1–§2, §5–§6; `specs/03` §6–§7.
**Sessions:** 2–3.

## Tasks
- [x] **2.1 Shell.** Responsive navigation (rail / bottom bar), routing, theme switch, settings store
      (Zustand + persisted), first-run welcome (handedness, guitar type) — 3 screens, skippable.
- [x] **2.2 Storage.** Dexie schema v1: `settings`, `favourites`, `folders`, `runs`, `tabs`, `events`,
      `skills`, `profiles`; migration test; **backup export/import** (versioned JSON, validated with a
      schema, round-trip e2e).
- [x] **2.3 Library screens.** Tabs Chords / Scales / Triads / Keys / Arpeggios; root and type pickers;
      filter chips (CAGED shape, string set, inversion, position system); label and colour toggles;
      full-neck diagram + card list; item detail (notes, intervals, formula, related items); favourites and
      folders; search box wired to the index with instant results; deep links (`/library/chord/C/maj`).
- [x] **2.4 Audio core.** AudioContext lifecycle (user-gesture unlock, suspend on hide), capture worklet,
      ring buffer, device picker, input meter, permission UX.
- [x] **2.5 Pitch + tuner.** MPM in TS with unit tests on synthesized tones (generator in `tools/`),
      tuner screen (our own layout: six string pills with reference-tone buttons, large note, ±50-cent
      meter, auto/guided mode, tuning presets, A4 setting, "above range" and "mic lost" states).
- [x] **2.6 Plucked-string synth + metronome.** Karplus–Strong worklet (reference tones; "hear this
      shape" button on library items — strum/arpeggiate the marks); look-ahead scheduler; metronome
      (tempo, time signature, subdivision, accent, tap tempo, count-in).
- [x] **2.7 Help.** "How it works" guide pages with our own illustrations (SVG drawn in code).
- [x] **2.8 Release.** Tag `v0.1`, deploy, update `STATE.md`.

## Result (2026-11-17)
| Gate | Result |
|---|---|
| 1. Library and backup e2e | Pass: search "sad chords in G" → G minor first; C major shows 5 CAGED chips that dim the other shapes; notes / intervals / fingers labels switch; a favourite survives reload; backup → delete everything → restore brings it back (`library.spec.ts`, `backup.spec.ts`). |
| 2. Tuner G6.1 via the fake microphone | Pass: 18 of 18 cases (each open string at −20, 0, +20 cents, plucked tone with realistic string stiffness) read within 1 cent (`tuner.spec.ts`, full suite). Unit level: ≤ 1 cent clean, ≤ 3 cents at 20 dB SNR, first stable reading ≤ 150 ms (within 5 cents), within 1 cent by 400 ms (D-014). |
| 3. Offline, first load | Pass: no external requests on any screen; cold start offline; first load including the offline cache is 1.41 MB (budget 5 MB) (`offline.spec.ts`, `pwa.spec.ts`). |
| 4. Screens at 1440×900, 820×1180, 844×390, dark and light | 60 screenshots of 10 screens reviewed via contact sheets; phone landscape led to a side-rail layout (see below). Curated set and contact sheets in `docs/screens/phase-2/`. |
| 5. PWA checks | Pass: manifest (name, start URL, standalone, colours, 192/512/maskable icons), manifest and theme-colour links, service worker takes control (`pwa.spec.ts`). |

Changes found during the gate: phones held sideways now get a narrow icon rail instead of top and bottom bars
(content kept 150 px of 390 before); the guided tuner did not advance while a string kept ringing (fixed).
Totals at release: 283 unit/component tests (core line coverage 99.2 %), 29 smoke e2e tests plus the 18-case
tuner matrix. Release 0.1.0 is tagged and deployed by the Release workflow once GitHub Pages is enabled.

## Acceptance (exit gate)
1. E2E: search "sad chords in G" → results; open C major → 5 CAGED chips filter the diagram; toggle
   notes/intervals/fingers; favourite survives reload; backup export → wipe → import restores it.
2. Tuner gate **G6.1** on synthesized tones via the fake microphone (each open string, ±20 cents offsets).
3. `offline.spec.ts` green on the production build; first-load transfer ≤ 5 MB at this stage.
4. Screens inspected in dark/light at 1440×900, 820×1180, 844×390; saved to `docs/screens/phase-2/`.
5. Lighthouse-style PWA checks pass (installable, service worker controls the page, icons present).

## Fallback ladder
- Browser ignores `echoCancellation:false` → detect by measuring a reference tone's sustain, warn once.
- MPM unstable on low E through a laptop mic → add YIN cross-check and widen the window to 4096.
