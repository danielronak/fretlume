/**
 * McLeod Pitch Method (docs/specs/02-audio.md §2): normalised square difference function via an
 * FFT autocorrelation, key maxima between zero crossings, first key maximum above k × the highest,
 * parabolic interpolation. Monophonic; used by the tuner and single-note checks.
 */
import { FFT } from './fft';

export interface PitchResult {
  fHz: number;
  /** NSDF value at the chosen peak, 0…1; above ~0.9 the signal is clearly periodic. */
  clarity: number;
}

export interface MpmOptions {
  /** Lowest pitch looked for. Default 60 Hz (below drop-C low string). */
  minHz?: number;
  /** Highest pitch looked for. Default 1400 Hz. */
  maxHz?: number;
  /** Peak-picking threshold relative to the highest key maximum. Default 0.93. */
  k?: number;
}

export class PitchDetector {
  private readonly fft: FFT;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly nsdf: Float64Array;

  constructor(readonly windowSize: number) {
    let size = 1;
    while (size < windowSize * 2) size <<= 1;
    this.fft = new FFT(size);
    this.re = new Float64Array(size);
    this.im = new Float64Array(size);
    this.nsdf = new Float64Array(windowSize);
  }

  detect(frame: Float32Array, sampleRate: number, options: MpmOptions = {}): PitchResult | null {
    const n = Math.min(frame.length, this.windowSize);
    const minLag = Math.max(2, Math.floor(sampleRate / (options.maxHz ?? 1400)));
    const maxLag = Math.min(n - 2, Math.ceil(sampleRate / (options.minHz ?? 60)));
    if (maxLag <= minLag) return null;

    // Autocorrelation r(τ) = IFFT(|FFT(x)|²) with zero padding to avoid wrap-around.
    const { re, im, nsdf } = this;
    re.fill(0);
    im.fill(0);
    let energy = 0;
    for (let i = 0; i < n; i++) {
      const s = frame[frame.length - n + i] ?? 0;
      re[i] = s;
      energy += s * s;
    }
    if (energy < 1e-10) return null;
    this.fft.transform(re, im);
    for (let i = 0; i < re.length; i++) {
      re[i] = re[i]! * re[i]! + im[i]! * im[i]!;
      im[i] = 0;
    }
    this.fft.transform(re, im, true);

    // m'(τ) = Σ x_j² + x_{j+τ}², updated incrementally; NSDF n(τ) = 2 r(τ) / m'(τ).
    let m = 2 * energy;
    const sample = (i: number) => frame[frame.length - n + i] ?? 0;
    for (let tau = 0; tau <= maxLag; tau++) {
      if (tau > 0) {
        const a = sample(tau - 1);
        const b = sample(n - tau);
        m -= a * a + b * b;
      }
      nsdf[tau] = m > 0 ? (2 * re[tau]!) / m : 0;
    }

    // Key maxima: the highest point between each positive-going and the next negative-going zero crossing.
    const peaks: number[] = [];
    let tau = 1;
    while (tau < maxLag && nsdf[tau]! > 0) tau++; // skip the zero-lag lobe
    while (tau < maxLag) {
      while (tau < maxLag && nsdf[tau]! <= 0) tau++;
      let best = -1;
      while (tau < maxLag && nsdf[tau]! > 0) {
        if (tau >= minLag && (best < 0 || nsdf[tau]! > nsdf[best]!)) best = tau;
        tau++;
      }
      if (best > 0) peaks.push(best);
    }
    if (peaks.length === 0) return null;

    const highest = Math.max(...peaks.map((p) => nsdf[p]!));
    const threshold = (options.k ?? 0.93) * highest;
    const chosen = peaks.find((p) => nsdf[p]! >= threshold);
    if (chosen === undefined) return null;

    // Parabolic interpolation around the chosen lag.
    const y0 = nsdf[chosen - 1]!;
    const y1 = nsdf[chosen]!;
    const y2 = nsdf[chosen + 1] ?? y1;
    const denom = y0 - 2 * y1 + y2;
    const offset = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
    const lag = chosen + offset;
    const clarity = Math.min(1, y1 - 0.25 * (y0 - y2) * offset);
    return { fHz: sampleRate / lag, clarity };
  }
}
