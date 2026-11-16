# Phase 2 — App shell, Library, Tuner (release v0.1)

**Goal.** A genuinely useful, installable, offline app without the camera: browse and search the
library, tune the guitar, use a metronome, keep favourites, back up data.
**Read first:** `specs/05-ux.md` §1–§2, §6–§8; `specs/02-audio.md` §1–§2, §5–§6; `specs/03` §6–§7.
**Sessions:** 2–3.

## Tasks
- [ ] **2.1 Shell.** Responsive navigation (rail / bottom bar), routing, theme switch, settings store
      (Zustand + persisted), first-run welcome (handedness, guitar type) — 3 screens, skippable.
- [ ] **2.2 Storage.** Dexie schema v1: `settings`, `favourites`, `folders`, `runs`, `tabs`, `events`,
      `skills`, `profiles`; migration test; **backup export/import** (versioned JSON, validated with a
      schema, round-trip e2e).
- [ ] **2.3 Library screens.** Tabs Chords / Scales / Triads / Keys / Arpeggios; root and type pickers;
      filter chips (CAGED shape, string set, inversion, position system); label and colour toggles;
      full-neck diagram + card list; item detail (notes, intervals, formula, related items); favourites and
      folders; search box wired to the index with instant results; deep links (`/library/chord/C/maj`).
- [ ] **2.4 Audio core.** AudioContext lifecycle (user-gesture unlock, suspend on hide), capture worklet,
      ring buffer, device picker, input meter, permission UX.
- [ ] **2.5 Pitch + tuner.** MPM in TS with unit tests on synthesized tones (generator in `tools/`),
      tuner screen (our own layout: six string pills with reference-tone buttons, large note, ±50-cent
      meter, auto/guided mode, tuning presets, A4 setting, "above range" and "mic lost" states).
- [ ] **2.6 Plucked-string synth + metronome.** Karplus–Strong worklet (reference tones; "hear this
      shape" button on library items — strum/arpeggiate the marks); look-ahead scheduler; metronome
      (tempo, time signature, subdivision, accent, tap tempo, count-in).
- [ ] **2.7 Help.** "How it works" guide pages with our own illustrations (SVG drawn in code).
- [ ] **2.8 Release.** Tag `v0.1`, deploy, update `STATE.md`.

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
