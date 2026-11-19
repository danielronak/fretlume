/**
 * Harmonic-comb salience (docs/specs/02-audio.md §4.2): how strongly a pitch is present in a whitened
 * spectrum, as the weighted sum of its first eight harmonics, each the maximum magnitude within a
 * tolerance of h·f0 that widens with h (real strings are slightly inharmonic). Pure.
 */

export const HARMONICS = 8;
export const HARMONIC_DECAY = 0.84;
const BASE_TOLERANCE_CENTS = 30;

export interface Comb {
  f0: number;
  salience: number;
  /** Peak magnitude found for each harmonic (index 0 = fundamental). */
  amps: number[];
  /** Bin of each peak (−1 when outside the spectrum). */
  bins: number[];
}

export const midiHz = (midi: number, a4Hz = 440) => a4Hz * 2 ** ((midi - 69) / 12);

export function comb(
  spec: Float64Array,
  sr: number,
  f0: number,
  options: { harmonics?: number; maxHz?: number } = {},
): Comb {
  const bins = spec.length;
  const binHz = sr / ((bins - 1) * 2);
  const H = options.harmonics ?? HARMONICS;
  const maxHz = options.maxHz ?? Math.min(sr / 2 - binHz, 7000);
  const amps: number[] = [];
  const peaks: number[] = [];
  let salience = 0;
  let w = 1;
  for (let h = 1; h <= H; h++) {
    const f = h * f0;
    if (f > maxHz) {
      amps.push(0);
      peaks.push(-1);
      continue;
    }
    const cents = BASE_TOLERANCE_CENTS + 4 * (h - 1);
    const r = 2 ** (cents / 1200);
    // At least the bin itself and its neighbours, so low notes are not missed between bins.
    const k0 = Math.max(1, Math.min(Math.floor(f / r / binHz), Math.round(f / binHz) - 1));
    const k1 = Math.min(bins - 1, Math.max(Math.ceil((f * r) / binHz), Math.round(f / binHz) + 1));
    let best = 0;
    let at = -1;
    for (let k = k0; k <= k1; k++)
      if (spec[k]! > best) {
        best = spec[k]!;
        at = k;
      }
    amps.push(best);
    peaks.push(at);
    salience += w * best;
    w *= HARMONIC_DECAY;
  }
  return { f0, salience, amps, bins: peaks };
}

/** Salience of pure noise in a whitened spectrum (each harmonic picks the max of a few ~1.0 bins). */
export function noiseSalience(): number {
  let s = 0;
  let w = 1;
  for (let h = 1; h <= HARMONICS; h++) {
    s += w * 1.6;
    w *= HARMONIC_DECAY;
  }
  return s;
}
