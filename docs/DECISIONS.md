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
