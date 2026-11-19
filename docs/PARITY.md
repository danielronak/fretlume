# Parity audit (phase 5 task 5.9)

The reference app's feature inventory is `docs/research/01-product-teardown.md` §1.2 (F1–F15). Each row
names how Fretlume does it, the e2e test that proves it (all in `app/e2e/parity.spec.ts` unless noted,
test titles start with the id), the deeper tests behind it, and a screenshot in
`docs/screens/phase-5/parity/`. Status as of v0.4.0 (2026-11-19): **15 of 15 implemented, every parity
test passing.** Nothing of the reference app is reused (name, wording, look); see CLAUDE.md rule 3.

| Id | Feature | Status | How Fretlume does it | Parity test · deeper tests | Screenshot |
|---|---|---|---|---|---|
| P-F1 | Live camera overlay | ✅ | Neck found by NeckNet + edge tracker; dots drawn flat on the board through the homography; open strings ring by the nut; roots ringed; mirrored view by default | `P-F1 live overlay…` · `stage.spec.ts` (dots within 2.5 mm on clips), `autolock.spec.ts` | `P-F1.png` |
| P-F2 | Lock model: re-lock, flip strings, overlay size, full screen, end | ✅ | Automatic lock with “Looks right?” confirmation, manual four-handle lock as fallback; Re-lock, Flip strings, Dot size 40–200 %, Full screen, End | `P-F2 lock model…` · `stage.spec.ts` (manual lock, lefty clip), `autolock.spec.ts` (lost → re-found) | `P-F2.png` |
| P-F3 | Floating deck: Start / Restart / Loop / Back / Next / Auto, one shape, move, collapse | ✅ | Deck under the video; in full screen it floats over the video, can be dragged (or moved with the arrow keys) and hidden | `P-F3 deck: floats…`, `P-F3 deck controls…` · `runs.spec.ts` | `P-F3.png`, `P-F3-controls.png` |
| P-F4 | Library: chords, scales, triads, keys (+ arpeggios), root picker, search | ✅ | Generated from seed tables; search by description (“sad chords in G”) | `P-F4 library…` · `library.spec.ts` | `P-F4.png` |
| P-F5 | Labels: notes / intervals / fingers | ✅ | Same label modes on diagrams and on the camera overlay | `P-F5 labels…` · `library.spec.ts` | `P-F5.png` |
| P-F6 | CAGED shapes and positions, colour by shape or by note | ✅ | Five CAGED chord shapes and scale positions with filter chips; colour by shape, note or degree; full neck | `P-F6 CAGED…` · `library.spec.ts` | `P-F6.png` |
| P-F7 | Triads by string set and inversion | ✅ | String sets 654/543/432/321; inversion filter dims the others | `P-F7 triads…` | `P-F7.png` |
| P-F8 | Keys: diatonic chords, numerals, roles | ✅ | Seven chords with roman numerals and plain-language roles (Home / Moving away / Pulling home) | `P-F8 keys…` · `library.spec.ts` (deep links) | `P-F8.png` |
| P-F9 | Neck profiles (acoustic 15 frets, electric 22) | ✅ | Guitar setting: steel acoustic, electric, classical; also tunes the neck finder | `P-F9 electric draws 22 frets…` · `autolock.spec.ts` (lefty clip on electric) | `P-F9.png` |
| P-F10 | Practice runs: build, save, reopen, step through | ✅ | Three-step builder (choose → set up → review); seconds or bars per card, repeats, tempo, sound with lit notes | `P-F10 practice runs…` · `runs.spec.ts` (phase gate: 4 cards → save → reload → auto-advance on Stage) | `P-F10.png` |
| P-F11 | Chromatic tuner with reference tones | ✅ | Microphone tuner, ±50 cents, guided string by string, tap a string to hear it, tunings and A4 | `P-F11 chromatic tuner…` · `tuner.spec.ts` (gate G6.1: every string at ±20 cents within 1 cent) | `P-F11.png` |
| P-F12 | Tab editor + import + play-along on the neck | ✅ | Keyboard-first editor (`h p / \ b r x ~`, durations, bars, undo), touch fret pad, chord row; import Guitar Pro 3–7 and MusicXML (alphaTab), ASCII, ChordPro, JSON; export ASCII and JSON; play-along on the camera neck and the diagram with approaching rings, speed, loop, count-in | `P-F12 tab editor…` · `tabs.spec.ts` (phase gate: hammer-on/slide/bend → play → export → re-import identical; camera play-along) | `P-F12.png`, `P-F12-play-along.png` |
| P-F13 | Lessons, playground, how-to guides | ✅ | Lesson list and player (explain + demo sections; the course itself is Phase 8); playground with layered shapes and progressions; 11 illustrated guides | `P-F13 lessons…` · `learn.spec.ts`, `playground.spec.ts`, `help.spec.ts` | `P-F13.png`, `P-F13-guides.png` |
| P-F14 | Left-handed | ✅ | Handedness mirrors diagrams; Mirror view and Flip strings on the Stage; remembered | `P-F14 left-handed…` · `stage.spec.ts` (lefty clip) | `P-F14.png` |
| P-F15 | Local data, backup and restore | ✅ | IndexedDB on the device; backup file save/restore in Settings; no network after install | `P-F15 local data…` · `backup.spec.ts`, `offline.spec.ts` | `P-F15.png` |

Run the audit with `npx playwright test e2e/parity.spec.ts` in `app/` (the camera tests need
`npm run fixtures` and the shipped NeckNet model); add `PARITY_SHOTS=1` to refresh the screenshots.
The tests without the camera are tagged `@smoke` and run in `npm run verify` and CI.

## Known differences (by design or later phases)
- **Wait-mode** in tab play-along needs note verification from the microphone (Phase 6).
- **Lessons**: the player runs explain and demo sections; guided, drill and check sections and the
  ≈ 70-lesson course arrive in Phases 6 and 8.
- The deck sits under the video and floats only in full screen (on phones a floating panel would cover
  the neck).
- Beyond parity: automatic neck finding, approaching-ring play-along, Guitar Pro/MusicXML/ChordPro
  import, playground progressions, offline PWA, free.
