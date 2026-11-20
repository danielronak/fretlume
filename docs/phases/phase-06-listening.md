# Phase 6 — Listening engine (release v0.5 🎸) — first "beyond" feature

**Goal.** The app hears what is played and responds: notes and chords are verified, wrong or muted
strings are named, timing is judged, wait-mode works, attempts are scored. The reference app states
it does not do this.
**Read first:** `specs/02-audio.md` (all); `specs/04-learning.md` §1, §5, §8; `specs/06` §5.
**Sessions:** 3–4.

## Tasks
- [x] **6.1 Audio fixture factory** (`tools/audio`, Python + TS twin of the string model): notes, chords,
      strums, faults, tab phrases; augmentations; FluidSynth path if `apt-get install fluidsynth
      fluid-soundfont-gm` works (optional). Manifest JSON with ground truth. Listen-check is impossible
      for the agent → validate fixtures spectrally (fundamental where expected, decay plausible).
- [x] **6.2 Analysis core** (pure TS, Node-testable): STFT, whitening, harmonic-comb salience,
      explaining-away, neighbour tests, verdict object; onset detector; timing judge; chroma + templates.
- [x] **6.3 Real-time plumbing:** worklet → analysis Worker; expectation API
      `listener.expect({ notes, muted, window })` → verdict events; self-masking of app-generated sound;
      level/noise/latency calibration flow.
- [x] **6.4 Judging in the session engine:** `judge: 'audio'`; `advance: on-correct` (wait-mode);
      leniency levels; "mark as played" escape; per-step attempt log → `AttemptEvent` store.
- [x] **6.5 Feedback UX:** dots pulse green/amber/red per string; one-line coach message from templates
      (spec 04 §8); string-by-string check flow; score summary at the end of a run (accuracy, timing,
      clean streak, tempo); gentle sounds; captions.
- [x] **6.6 Apply everywhere:** practice runs (optional judging toggle), tab play-along (note hits,
      timing, wait-mode per note/bar, score), tuner already done, "What am I playing?" tool
      (chroma suggestion + reverse chord lookup).
- [x] **6.7 Benches + e2e:** `npm run bench:audio` → gates **G6.2–G6.6**; scripted players (perfect /
      muted-string / wrong-fret / sloppy-timing) through the fake microphone on a 6-step run.
- [ ] **6.8** (Optional, report only) GuitarSet evaluation if the owner allows `zenodo.org`.
- [ ] **6.9** Tag `v0.5`, deploy, 🎸 request: "play G, C, D slowly; did it hear you? any false fails?"
      — diagnostics include verdict logs.

## Acceptance (exit gate)
G6.2–G6.6 pass with numbers in `docs/benchmarks/audio-phase6.json`; e2e scripted players behave as
expected (perfect passes all; muted-string gets the right string named in string-by-string mode; no
step is impassable — escape hatch tested); app remains fully usable with microphone denied.

## Fallback ladder
- Chord false-fail rate too high → default to relaxed leniency + auto-suggest string-by-string check
  when uncertain; judge chords on "root + third + no clearly wrong note".
- Octave/overtone confusions → strengthen explaining-away; require fundamental-band energy for
  low strings; fall back to chroma-only pass/fail for full six-string strums.
- Real-time cost too high → analysis at 11 025 Hz for chords, decimate hop; move STFT to WASM only if needed.
