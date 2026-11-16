# Phase 10 — Jam & creative tools (release v0.9)

**Goal.** Make practice feel like music: a backing band, scale guidance that follows the chords,
looping, recording, and games.
**Read first:** `specs/02-audio.md` §5–§6; `specs/03` §5; `specs/04` §1; `specs/05-ux.md` §4.
**Sessions:** 2–3.

## Tasks
- [ ] **10.1 Backing band:** synthesized drums/bass/keys; style patterns (rock 8ths, blues shuffle, funk
      16ths, pop ballad, bossa, reggae one-drop, country train); progression editor (roman numerals or
      chord symbols, bars per chord), key, tempo, swing, count-in, mixer; presets (12-bar blues in A,
      I–V–vi–IV in G, ii–V–I in C, minor vamp).
- [ ] **10.2 Progression mode on the neck:** for the current chord show chord tones (bright) + the
      recommended scale (dim) per the chord-scale map; "next chord" ghost one beat early; position lock
      (stay in one CAGED position through the changes) vs follow-the-chord; optional target-note game
      (land on a chord tone at each change, judged by the listening engine).
- [ ] **10.3 Looper:** record up to 4 layers from the microphone, quantised to the bar; overdub/undo;
      play scales over your own loop (self-masking uses the loop's known spectrum).
- [ ] **10.4 Clip recording:** `MediaRecorder` capture of the composited video + overlay + audio to a
      local file (explicit, clearly indicated; never automatic). Useful for sharing progress.
- [ ] **10.5 Games:** note-finder ("find every G, fastest wins against your past self"), interval ear
      trainer (hear two notes → play them), chord ear trainer, call-and-response phrases, rhythm tap.
      All feed `AttemptEvent`s and the learner model.
- [ ] **10.6** Benches for scheduler timing (audio-clock jitter of scheduled events ≤ 2 ms in tests),
      e2e for band + progression overlay; tag `v0.9`, deploy.

## Acceptance (exit gate)
E2E: 12-bar blues preset plays 12 bars with correct chord overlay changes on the beat (test hook reads
the active chord per bar); target-note game scores a scripted player correctly; a 5-second clip records
to a non-empty file; looper round-trip; no regression in G6.5 (self-masking) with the band playing.

## Fallback ladder
- Synth band sounds poor → fewer, cleaner styles (rock, blues, ballad) rather than many weak ones.
- Looper latency unmanageable on some devices → mark as desktop-only.
