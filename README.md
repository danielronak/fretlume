# Fretlume

Free, offline, open-source guitar learning with live overlays on your real guitar.
*(Working name. Version 0.1: a library of chords, scales, triads and keys with diagrams and search, a
tuner, a metronome and help guides, all offline. The camera overlay arrives next. See `docs/STATE.md`.)*

```bash
npm ci
npm run dev        # start the app locally
npm run verify     # typecheck, lint, unit tests, browser smoke tests
```

| Start here | |
|---|---|
| `docs/MASTER_PLAN.md` | Scope, architecture decisions, quality gates, the 13 phases, risks |
| `CLAUDE.md` | Operating manual for the coding agent that builds the app |
| `docs/STATE.md` | Where the build currently stands and what is next |
| `docs/KICKOFF_PROMPTS.md` | The prompts the owner pastes to continue the build |
| `docs/research/` | Reference-app teardown, competitive landscape, spike results |
| `docs/specs/` | Vision, audio, theory/content, learning, UX, testing & synthetic data |
| `docs/phases/` | One file per phase: tasks, acceptance gates, fallback ladders |
| `spikes/` | Working prototypes: fretboard registration (Python), fake-camera browser harness, CPU training benchmark |
