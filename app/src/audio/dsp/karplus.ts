/**
 * Extended Karplus–Strong plucked string (docs/specs/02-audio.md §6), rendered to a buffer.
 * Loop: two-point average (0.5 sample delay, gentle low-pass) plus a first-order all-pass that
 * supplies the fractional part of the period, so reference tones are in tune to a fraction of a cent.
 */
import { rng } from './synth';

export interface PluckOptions {
  seconds?: number;
  /** Time for the note to fall by 60 dB. Default: 4 s for low notes down to 2 s for high ones. */
  t60?: number;
  /** 0–1: how bright the attack is. */
  brightness?: number;
  /** Where along the string it is plucked, as a fraction from the bridge (0.13 ≈ near the soundhole). */
  pickPosition?: number;
  amplitude?: number;
  seed?: number;
}

export function renderPluck(
  fHz: number,
  sampleRate: number,
  options: PluckOptions = {},
): Float32Array<ArrayBuffer> {
  const seconds = options.seconds ?? 2.5;
  const total = Math.round(seconds * sampleRate);
  const out = new Float32Array(total);
  const period = sampleRate / fHz;
  // Loop delay = L (buffer) + 0.5 (averager) + δ (all-pass), with δ kept in [0.1, 1.1).
  const L = Math.max(2, Math.floor(period - 0.5 - 0.1));
  const delta = period - 0.5 - L;
  const C = (1 - delta) / (1 + delta);
  const t60 = options.t60 ?? Math.max(1.5, 4.5 - Math.log2(fHz / 82.4) * 0.9);
  const loopGain = 10 ** (-3 / (t60 * fHz));

  // Excitation: one period of noise, low-passed for warmth, with a pick-position comb.
  const random = rng(options.seed ?? 11);
  const excitation = new Float32Array(L);
  const brightness = options.brightness ?? 0.5;
  let previous = 0;
  for (let i = 0; i < L; i++) {
    const white = random() * 2 - 1;
    previous = previous + (0.25 + 0.7 * brightness) * (white - previous);
    excitation[i] = previous;
  }
  const pickDelay = Math.max(1, Math.round(L * (options.pickPosition ?? 0.13)));
  for (let i = L - 1; i >= pickDelay; i--) excitation[i]! -= excitation[i - pickDelay]!;
  let mean = 0;
  for (const e of excitation) mean += e;
  mean /= L;
  for (let i = 0; i < L; i++) excitation[i]! -= mean;

  const history = new Float32Array(L + 2); // ring of y
  let write = 0;
  let averagePrevious = 0;
  let allpassPrevious = 0;
  for (let n = 0; n < total; n++) {
    const yL = history[(write - L + history.length * 4) % history.length]!;
    const yL1 = history[(write - L - 1 + history.length * 4) % history.length]!;
    const average = 0.5 * (yL + yL1);
    const allpass = C * average + averagePrevious - C * allpassPrevious;
    averagePrevious = average;
    allpassPrevious = allpass;
    const y = (n < L ? excitation[n]! : 0) + loopGain * allpass;
    history[write] = y;
    write = (write + 1) % history.length;
    out[n] = y;
  }

  // Normalise, then fade the last 50 ms so buffers end cleanly.
  let peak = 0;
  for (const s of out) peak = Math.max(peak, Math.abs(s));
  const scale = (options.amplitude ?? 0.5) / (peak || 1);
  const fade = Math.min(total, Math.round(0.05 * sampleRate));
  for (let i = 0; i < total; i++) {
    const tail = total - i;
    out[i]! *= scale * (tail < fade ? tail / fade : 1);
  }
  return out;
}

/** A metronome click: a short decaying sine burst. */
export function renderClick(
  fHz: number,
  sampleRate: number,
  amplitude = 0.6,
  ms = 35,
): Float32Array<ArrayBuffer> {
  const length = Math.round((ms / 1000) * sampleRate);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    out[i] = amplitude * Math.exp(-t * 140) * Math.sin(2 * Math.PI * fHz * t);
  }
  return out;
}
