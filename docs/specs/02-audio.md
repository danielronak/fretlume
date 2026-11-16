# Spec 02 — Audio: tuner, listening engine, synthesis

Principle (ADR A4): the app almost always knows what *should* be sounding. Verify expectations; do not
transcribe blindly. Everything is plain DSP in TypeScript — no trained model is required for v1.

## 1. Capture
- `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })`.
  These three must be **off** (they destroy sustained guitar tones). Fall back gracefully if a browser
  ignores the constraints; show an input-level meter.
- One `AudioContext` (`latencyHint: 'interactive'`). Capture → `AudioWorkletNode('capture')` that
  downmixes to mono, optionally resamples to 22 050 Hz for analysis, and posts 1024-sample hops through
  a ring buffer to the analysis code (same worklet for light work; heavier analysis in a Worker).
- Never route the microphone to the speakers. When the app plays reference tones/backing tracks,
  apply **self-masking**: the analysis ignores or down-weights bins the app itself is emitting, and
  recommends headphones for jam mode.
- **Calibration (once, 10 s, optional):** noise floor (silence), level (strum hard), round-trip latency
  estimate (app click → mic) used by timing judgement. Store per device.

## 2. Monophonic pitch (tuner, single notes)
- **MPM (McLeod)** with parabolic interpolation, window 2048 @ 22.05 kHz for E2 (82.4 Hz) upward,
  4096 for drop/bass tunings; clarity threshold 0.9; median-of-5 smoothing; octave-error guard using the
  expected note when one exists.
- Output `{ fHz, cents, clarity, rmsDb, tMs }` at ≥ 40 Hz.
- **Tuner UX:** string auto-detection (nearest target of the current tuning) or guided string order;
  needle ±50 cents; in-tune window ±3 cents held 400 ms; "above open-string range" message; reference tone
  per string (plucked-string synth, §6); custom tunings and A4 reference 430–450 Hz.

## 3. Onsets and timing
- Spectral-flux onset detector (log-magnitude, half-wave rectified, adaptive median threshold),
  minimum inter-onset 60 ms; strum = cluster of onsets within 80 ms.
- Timing judgement against the session clock: `Δ = tOnset − tExpected − latencyMs`;
  perfect |Δ| ≤ 45 ms, good ≤ 90 ms, early/late beyond; running mean of Δ reports "rushing"/"dragging".

## 4. Expected-note verification (chords, double stops, tab steps)
For an expected set of sounding notes `E = {(string, fret) → f0}` and muted strings `M`:
1. STFT 4096 @ 22.05 kHz (hop 512), magnitude → whitened (divide by a 1/3-octave moving median).
2. **Harmonic-comb salience** for each candidate f0: `S(f0) = Σ_{h=1..8} w_h · max mag within ±30 cents of h·f0`,
   `w_h = 0.84^(h−1)`, with inharmonicity tolerance widening at high harmonics.
3. **Explaining-away:** process expected notes from lowest to highest; subtract each accepted note's
   predicted partial contribution (using its measured amplitudes) from shared bins before scoring the
   next, so an octave doubling is not automatically "present".
4. **Present** if `S(f0)` exceeds both a noise-relative threshold and a fraction of the strongest
   expected note; evaluated over a 250–400 ms window after the strum onset.
5. **Wrong-note test:** salience at the chromatic neighbours (±1, ±2 semitones) of each expected note and
   at the open-string pitches of strings that should be muted; a neighbour clearly stronger than the
   expected note ⇒ "string N: sounds like F#, expected G (finger one fret low)".
6. **Verdict:** `{ ok, perNote: present|weak|missing|wrong(pitch), extra: [...], confidence }`.
   Leniency levels (relaxed / standard / strict) scale the thresholds; default relaxed for beginners.
7. **String-by-string check** (the precise mode): the player picks each string in turn; step 2 becomes a
   monophonic comparison → unambiguous "string 2 is muted/buzzing" (buzz = high spectral flatness +
   short decay). Used in lessons the first times a chord is learned and whenever a strum verdict is
   ambiguous.
8. **Chroma fallback** for free play / "what am I playing?": 12-bin chroma from the whitened spectrum
   matched against chord templates (maj, min, 7, maj7, m7, sus2, sus4, dim, aug, 5) with a 0.5 s HMM
   smoothing. Displayed as a suggestion, never used for grading.

Ambiguity is expected and acceptable: when unsure, say "sounded close" and count it as a pass in relaxed
mode. False fails are worse than false passes for motivation (risk R5).

## 5. Session clock
All timing uses `AudioContext.currentTime`. Metronome and backing tracks are scheduled with a
look-ahead scheduler (25 ms timer, 100 ms horizon). Visual beat indicators are driven from the same
clock, compensating `outputLatency`.

## 6. Synthesis (offline, no samples)
- **Plucked string**: extended Karplus–Strong (pick position comb, loop low-pass, stiffness all-pass,
  per-string damping) in an AudioWorklet; used for reference tones, tab playback and test fixtures.
- **Backing band (Phase 10)**: synthesized kick/snare/hat (noise + sine bursts), bass (filtered saw/sine),
  pad/keys (detuned saws through a low-pass) driven by a pattern library per style.
- **Metronome**: accented click, subdivisions, count-in, tempo ramp.

## 7. Test corpus and gates (`npm run bench:audio`)
Fixtures are generated, never recorded by the owner:
- The Python twin of the plucked-string model plus, where apt is available, FluidSynth with
  `fluid-soundfont-gm` (steel, nylon, clean electric programs) renders: every note E2–E6; 200 chord
  voicings × 3 strum speeds × up/down; deliberate faults (one string muted, one finger a fret off, extra
  open string); tab phrases at several tempi.
- Augmentations: room impulse (synthetic exponential-decay noise IRs), laptop-mic band-limiting
  (150 Hz–7 kHz), background noise (pink, speech-shaped), level changes, detuning ±15 cents, 44.1/48 kHz.
- Unit tests run the pure-TS DSP on WAV buffers in Node; e2e tests feed WAVs through Chromium's fake
  microphone.

| ID | Gate |
|---|---|
| G6.1 | Tuner: \|error\| ≤ 1 cent on clean tones, ≤ 3 cents with noise at 20 dB SNR; first stable reading ≤ 150 ms |
| G6.2 | Mono note verification F1 ≥ 0.97; octave errors ≤ 0.5 % |
| G6.3 | Chord verification accuracy ≥ 0.92 overall; false-fail ≤ 5 % (standard leniency); single-muted-string detection recall ≥ 0.75 in strum mode and ≥ 0.97 in string-by-string mode |
| G6.4 | Onset timing error: median \|Δ\| ≤ 12 ms on fixtures |
| G6.5 | Self-masking: with the app's own reference tone playing at −12 dB, false-pass rate ≤ 2 % |
| G6.6 | Analysis cost ≤ 25 % of one core on the container (proxy for real-time on phones) |

Optional real-audio evaluation (GuitarSet, needs `zenodo.org` allowed): report only, not a gate.
