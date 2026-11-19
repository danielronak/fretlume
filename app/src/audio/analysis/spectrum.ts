/**
 * Short-time spectra for the listening engine (docs/specs/02-audio.md §4.1): Hann-windowed magnitude
 * spectrum, and whitening by a 1/3-octave moving median so harmonics stand out against the
 * instrument's and the room's colour. Pure.
 */
import { FFT } from '../dsp/fft';

const ffts = new Map<number, FFT>();
const windows = new Map<number, Float64Array>();

function fftOf(n: number): FFT {
  let f = ffts.get(n);
  if (!f) ffts.set(n, (f = new FFT(n)));
  return f;
}

export function hann(n: number): Float64Array {
  let w = windows.get(n);
  if (!w) {
    w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    windows.set(n, w);
  }
  return w;
}

/** Magnitude spectrum (n/2 + 1 bins) of `n` samples starting at `start` (zero-padded past the end). */
export function magnitude(signal: ArrayLike<number>, start: number, n: number): Float64Array {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const w = hann(n);
  for (let i = 0; i < n; i++) {
    const j = start + i;
    re[i] = j >= 0 && j < signal.length ? signal[j]! * w[i]! : 0;
  }
  fftOf(n).transform(re, im);
  const out = new Float64Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) out[k] = Math.hypot(re[k]!, im[k]!);
  return out;
}

/** Element-wise mean of several spectra (the analysis window after an onset). */
export function meanSpectrum(spectra: readonly Float64Array[]): Float64Array {
  const out = new Float64Array(spectra[0]?.length ?? 0);
  for (const s of spectra) for (let k = 0; k < out.length; k++) out[k]! += s[k]! / spectra.length;
  return out;
}

const median = (xs: number[]) => {
  xs.sort((a, b) => a - b);
  const m = xs.length >> 1;
  return xs.length % 2 ? xs[m]! : 0.5 * (xs[m - 1]! + xs[m]!);
};

/**
 * Divide each bin by the median magnitude within ±1/6 octave (a 1/3-octave moving median), evaluated
 * on a 1/24-octave grid and interpolated. The floor (`floorRel` × the median of the whole spectrum)
 * keeps silence from turning into loud noise.
 */
export function whiten(
  mag: Float64Array,
  sr: number,
  floorRel = 0.05,
  /** Take the envelope from this spectrum instead (e.g. whiten a difference by the full signal). */
  envelopeOf: Float64Array = mag,
): Float64Array {
  const bins = mag.length;
  const n = (bins - 1) * 2;
  const binHz = sr / n;
  const fLo = 40;
  const fHi = Math.min(sr / 2, 8000);
  const grid: { k: number; m: number }[] = [];
  for (let f = fLo; f <= fHi; f *= 2 ** (1 / 24)) {
    const k0 = Math.max(1, Math.floor((f * 2 ** (-1 / 6)) / binHz));
    const k1 = Math.min(bins - 1, Math.ceil((f * 2 ** (1 / 6)) / binHz));
    const xs: number[] = [];
    for (let k = k0; k <= k1; k++) xs.push(envelopeOf[k]!);
    grid.push({ k: f / binHz, m: median(xs) });
  }
  const all: number[] = [];
  for (let k = 1; k < bins; k += 4) all.push(envelopeOf[k]!);
  const floor = Math.max(1e-12, median(all) * floorRel);
  const out = new Float64Array(bins);
  let g = 0;
  for (let k = 0; k < bins; k++) {
    while (g < grid.length - 2 && grid[g + 1]!.k < k) g++;
    const a = grid[g]!;
    const b = grid[Math.min(g + 1, grid.length - 1)]!;
    const t = b.k > a.k ? Math.max(0, Math.min(1, (k - a.k) / (b.k - a.k))) : 0;
    const env = a.m + (b.m - a.m) * t;
    out[k] = mag[k]! / Math.max(env, floor);
  }
  return out;
}

/**
 * The whitened mean spectrum of the window after an onset (§4.4: 250–400 ms after the strum):
 * frames of `n` samples every `hop`, starting `delayS` after `startSample`, covering `durationS`.
 */
export function windowSpectrum(
  signal: ArrayLike<number>,
  sr: number,
  startSample: number,
  options: { n?: number; hop?: number; delayS?: number; durationS?: number } = {},
): Float64Array {
  const n = options.n ?? 4096;
  const hop = options.hop ?? 512;
  const first = startSample + Math.round((options.delayS ?? 0.03) * sr);
  const last = first + Math.round((options.durationS ?? 0.3) * sr) - n;
  const spectra: Float64Array[] = [];
  for (let s = first; s <= Math.max(first, last); s += hop) spectra.push(magnitude(signal, s, n));
  return whiten(meanSpectrum(spectra), sr);
}

/**
 * Whitened spectrum of what is *new* after `startSample`: the magnitude after the pluck minus the
 * magnitude just before it (notes that were already ringing cancel out).
 */
export function newEnergySpectrum(
  signal: ArrayLike<number>,
  sr: number,
  startSample: number,
  options: { n?: number; delayS?: number; durationS?: number } = {},
): Float64Array {
  const n = options.n ?? 4096;
  const hop = n / 4;
  const after: Float64Array[] = [];
  const first = startSample + Math.round((options.delayS ?? 0.03) * sr);
  const last = first + Math.round((options.durationS ?? 0.25) * sr) - n;
  for (let s = first; s <= Math.max(first, last); s += hop) after.push(magnitude(signal, s, n));
  const before = magnitude(signal, startSample - n - Math.round(0.005 * sr), n);
  const a = meanSpectrum(after);
  const diff = new Float64Array(a.length);
  for (let k = 0; k < a.length; k++) diff[k] = Math.max(0, a[k]! - before[k]!);
  return whiten(diff, sr, 0.05, a);
}
