/**
 * Onsets and timing (docs/specs/02-audio.md §3): log-magnitude spectral flux, half-wave rectified,
 * against an adaptive median threshold; at least 60 ms between onsets; a strum is a cluster of
 * onsets within 80 ms. Streaming (push samples as they arrive) and pure.
 */
import { FFT } from '../dsp/fft';
import { hann } from './spectrum';

export interface OnsetOptions {
  sampleRate: number;
  /** Frame and hop in samples (default 1024 / 128 at 22.05 kHz: 46 ms frames every 5.8 ms). */
  frame?: number;
  hop?: number;
  /** Flux must exceed median(recent) × this + `delta`. */
  multiplier?: number;
  delta?: number;
  minGapMs?: number;
}

export class OnsetDetector {
  private readonly n: number;
  private readonly hop: number;
  private readonly sr: number;
  private readonly fft: FFT;
  private readonly win: Float64Array;
  private readonly buf: Float64Array;
  private filled = 0;
  /** Samples consumed before the buffer's first sample. */
  private offset = 0;
  private prev: Float64Array | null = null;
  private readonly history: number[] = [];
  private readonly flux: { t: number; v: number }[] = [];
  private lastOnset = -Infinity;
  private lastFlux = 0;
  /** The last RING samples, by absolute index (for refining onsets in the time domain). */
  private readonly ring: Float64Array;
  private written = 0;
  private readonly mult: number;
  private readonly delta: number;
  private readonly minGap: number;

  constructor(options: OnsetOptions) {
    this.sr = options.sampleRate;
    this.n = options.frame ?? 1024;
    this.hop = options.hop ?? 128;
    this.fft = new FFT(this.n);
    this.win = hann(this.n);
    this.buf = new Float64Array(this.n);
    this.ring = new Float64Array(this.n * 4);
    this.mult = options.multiplier ?? 1.6;
    this.delta = options.delta ?? 0.4;
    this.minGap = (options.minGapMs ?? 60) / 1000;
  }

  /** Feed samples; returns onset times (seconds since the first sample pushed) found so far. */
  push(samples: ArrayLike<number>): number[] {
    const found: number[] = [];
    let i = 0;
    while (i < samples.length) {
      const take = Math.min(this.n - this.filled, samples.length - i);
      for (let k = 0; k < take; k++) {
        this.buf[this.filled + k] = samples[i + k]!;
        this.ring[(this.written + k) % this.ring.length] = samples[i + k]!;
      }
      this.written += take;
      this.filled += take;
      i += take;
      if (this.filled < this.n) break;
      const t = this.frame();
      if (t !== null) found.push(t);
      // Slide by one hop.
      this.buf.copyWithin(0, this.hop);
      this.filled -= this.hop;
      this.offset += this.hop;
    }
    return found;
  }

  private frame(): number | null {
    const n = this.n;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let k = 0; k < n; k++) re[k] = this.buf[k]! * this.win[k]!;
    this.fft.transform(re, im);
    const bins = n / 2;
    const mag = new Float64Array(bins);
    // Log magnitude (compressed), 60 Hz–8 kHz.
    const k0 = Math.max(1, Math.floor((60 * n) / this.sr));
    const k1 = Math.min(bins - 1, Math.ceil((8000 * n) / this.sr));
    for (let k = k0; k <= k1; k++) mag[k] = Math.log1p(1000 * Math.hypot(re[k]!, im[k]!));
    let v = 0;
    if (this.prev) for (let k = k0; k <= k1; k++) v += Math.max(0, mag[k]! - this.prev[k]!);
    this.prev = mag;
    v /= k1 - k0 + 1;
    // Frame time: the window's centre.
    const t = (this.offset + n / 2) / this.sr;
    this.flux.push({ t, v });
    this.history.push(v);
    if (this.history.length > 40) this.history.shift();
    // Decide on the frame before last (a peak needs its right neighbour).
    if (this.flux.length < 3) return null;
    if (this.flux.length > 8) this.flux.shift();
    const L = this.flux.length;
    const a = this.flux[L - 3]!;
    const b = this.flux[L - 2]!;
    const c = this.flux[L - 1]!;
    const sorted = [...this.history].sort((x, y) => x - y);
    const median = sorted[sorted.length >> 1]!;
    const threshold = median * this.mult + this.delta * 0.05;
    // Right after an onset, a pluck's own ripple must not count: demand half its flux for 120 ms.
    const recent = b.t - this.lastOnset < 0.12 ? 0.5 * this.lastFlux : 0;
    if (
      b.v > a.v &&
      b.v >= c.v &&
      b.v > threshold &&
      b.v > recent &&
      b.t - this.lastOnset >= this.minGap
    ) {
      this.lastOnset = b.t;
      this.lastFlux = b.v;
      return this.refine(b.t);
    }
    return null;
  }

  /**
   * The flux peaks as soon as a pluck enters the window, so its time is only good to ±half a window.
   * Find where the short-term energy rises within that window instead.
   */
  private refine(tFrame: number): number {
    const centre = Math.round(tFrame * this.sr);
    const from = Math.max(this.written - this.ring.length, centre - this.n / 2 - this.hop);
    const to = Math.min(this.written, centre + this.n / 2);
    // Energy of the first difference (the pick's click is broadband; low strings would otherwise make
    // a short window's energy wobble with each cycle), over ~3 ms.
    const W = 64;
    const env: number[] = [];
    let acc = 0;
    const d = (i: number) =>
      this.ring[i % this.ring.length]! - this.ring[(i - 1 + this.ring.length) % this.ring.length]!;
    for (let i = from; i < to; i++) {
      acc += d(i) ** 2;
      if (i - from >= W) acc -= d(i - W) ** 2;
      env.push(acc);
    }
    if (env.length < W * 4) return tFrame;
    // The rise into the window's loudest point: walk back from the peak to where the energy was
    // still within 15 % of the quiet level before it (an earlier note may still be ringing).
    let kp = W;
    for (let i = W; i < env.length; i++) if (env[i]! > env[kp]!) kp = i;
    let base = Infinity;
    for (let i = W; i <= kp; i++) base = Math.min(base, env[i]!);
    const level = base + 0.15 * (env[kp]! - base);
    let k = kp;
    while (k > W && env[k - 1]! >= level) k--;
    return (from + k - W / 2) / this.sr;
  }
}

/** All onsets of a buffer (seconds). */
export function detectOnsets(signal: ArrayLike<number>, options: OnsetOptions): number[] {
  return new OnsetDetector(options).push(signal);
}

/** Group onsets closer than `windowMs` into strums: the first and last onset of each. */
export function strums(
  onsets: readonly number[],
  windowMs = 80,
): { start: number; end: number; count: number }[] {
  const out: { start: number; end: number; count: number }[] = [];
  for (const t of onsets) {
    const last = out[out.length - 1];
    if (last && t - last.end <= windowMs / 1000) {
      last.end = t;
      last.count++;
    } else out.push({ start: t, end: t, count: 1 });
  }
  return out;
}

export type TimingGrade = 'perfect' | 'good' | 'early' | 'late';

/** §3: Δ = onset − expected − latency; perfect ≤ 45 ms, good ≤ 90 ms. */
export function judgeTiming(
  onsetMs: number,
  expectedMs: number,
  latencyMs = 0,
): { deltaMs: number; grade: TimingGrade } {
  const deltaMs = onsetMs - expectedMs - latencyMs;
  const a = Math.abs(deltaMs);
  return {
    deltaMs,
    grade: a <= 45 ? 'perfect' : a <= 90 ? 'good' : deltaMs < 0 ? 'early' : 'late',
  };
}

/** Running timing bias: mean Δ of the last `n` judged onsets; "rushing" below −20 ms, "dragging" above 20. */
export function timingBias(
  deltasMs: readonly number[],
  n = 8,
): { meanMs: number; tendency: 'rushing' | 'dragging' | 'steady' } {
  const recent = deltasMs.slice(-n);
  const meanMs = recent.length ? recent.reduce((s, d) => s + d, 0) / recent.length : 0;
  return { meanMs, tendency: meanMs < -20 ? 'rushing' : meanMs > 20 ? 'dragging' : 'steady' };
}
