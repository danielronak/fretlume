# Audio fixture factory (phase 6 task 6.1)

`npm run fixtures:audio` builds the listening engine's test corpus in `fixtures/generated/audio/`
(not committed; deterministic):

1. `app/bench/audioPlan.ts` decides **what is played** with the theory engine: every note E2–E6, 192
   chord voicings strummed at 15/35/70 ms per string (down and up), faults (one string muted, one finger a
   fret off, a silent string ringing open), string-by-string checks, and pentatonic phrases at 60–160 BPM
   with ±8 ms human timing. Written to `plan.json`.
2. `render.py` renders each group with each source: `ks` (our Karplus–Strong twin, `ks.py`, the same
   model as `app/src/audio/dsp/karplus.ts`) and FluidSynth's General MIDI guitars (`steel`, `nylon`,
   `electric`, FluidR3_GM, MIT) when `fluidsynth` and `fluid-soundfont-gm` are installed. Every note gets
   its own MIDI channel per string, so a ±15-cent detune per strum is a pitch bend. Augmented copies apply
   a random chain per item: synthetic room, laptop-microphone band limit (150 Hz–7 kHz), pink or
   speech-shaped noise at 10–30 dB SNR, level −24…0 dB. `manifest.json` lists every item with its start
   time, what was asked (`expected`, `muted`), what sounded (`notes`), the fault and the condition.
3. `validate.py` checks the audio without listening: every single note must have the planned pitch
   (YIN, ±35 cents, no octave errors) and decay; every phrase note must add energy at a harmonic of its
   pitch. Clean files must reach 98 %; the result is in `validation.json`.

Requirements: `uv` (Python 3.12+, numpy, scipy). Optional: `apt-get install fluidsynth fluid-soundfont-gm`.
