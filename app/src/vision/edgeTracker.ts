/**
 * EdgeTracker: refines a rough board→image homography by measuring the fret wires and board edges
 * in a rectified strip (docs/specs/01-vision.md §4). Port of ml/synth/reference_tracker.py
 * ("parity" mode reproduces it); the improved mode adds the steps of task 3.4.
 *
 * Board coordinates are millimetres (spec §1). The strip covers x ∈ [-14, end + 6] mm and
 * y ∈ [-36, 36] mm at STRIP_W × STRIP_H pixels.
 */
import { fretX, halfWidth, type InstrumentModel } from '@core/guitar/instrument';
import {
  apply,
  fitHomography,
  invert,
  multiply,
  projective1D,
  type Mat3,
  type Pt,
} from './geometry';
import { sampleLuma, type Image } from './image';
import { blur1D, blur2D, median, percentile } from './signal';

export const STRIP_W = 768;
export const STRIP_H = 128;
const SYH = 36;

export interface RefineOptions {
  /** Refinement rounds. Default 5 (lock); tracking uses 1–2. */
  iterations?: number;
  /** Wide comb search for (re)initialisation; narrow for frame-to-frame tracking. Default true. */
  wide?: boolean;
  /**
   * 'parity' reproduces the reference tracker exactly (out-of-frame pixels read as black).
   * 'improved' ignores out-of-frame pixels. Default 'improved'.
   */
  mode?: 'parity' | 'improved';
  /** Fret wires lighter than the board ('bright') or darker ('dark'). Default 'bright'. */
  polarity?: 'bright' | 'dark';
}

export interface RefineResult {
  H: Mat3;
  /** Measurements kept by the robust fit in the last round (0 = failed, H unchanged). */
  inliers: number;
  /** Sum of the robust weights in the last round. */
  score: number;
  /** Number of image pixel samples taken (cost proxy, gate G3.5). */
  samples: number;
}

/** Python's round(): halves go to the even neighbour. */
export function pyRound(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

export class EdgeTracker {
  readonly frets: number;
  readonly sx0: number;
  readonly sx1: number;
  readonly kx: number;
  readonly ky = STRIP_H / (2 * SYH);
  readonly S: Mat3;
  readonly Sinv: Mat3;
  readonly xs: number[];
  readonly cols0: number[];
  readonly spacing: number[];
  private readonly raw = new Float32Array(STRIP_W * STRIP_H);
  private readonly tmp = new Float32Array(STRIP_W * STRIP_H);
  private readonly strip = new Float32Array(STRIP_W * STRIP_H);
  private readonly d2 = new Float32Array(STRIP_W * STRIP_H);
  private readonly valid = new Uint8Array(STRIP_W * STRIP_H);
  private readonly column = new Float32Array(STRIP_H);

  constructor(readonly model: InstrumentModel) {
    this.frets = model.fretCount;
    this.sx0 = -14;
    this.sx1 = fretX(model, model.fretCount) + 6 + 6;
    this.kx = STRIP_W / (this.sx1 - this.sx0);
    this.S = [this.kx, 0, -this.sx0 * this.kx, 0, this.ky, STRIP_H / 2, 0, 0, 1];
    this.Sinv = invert(this.S);
    this.xs = Array.from({ length: this.frets + 1 }, (_, n) => fretX(model, n));
    this.cols0 = this.xs.map((x) => (x - this.sx0) * this.kx);
    this.spacing = this.cols0.map((c, n) =>
      n < this.frets ? this.cols0[n + 1]! - c : this.cols0[n]! - this.cols0[n - 1]!,
    );
  }

  private row(yMm: number): number {
    return Math.trunc((yMm + SYH) * this.ky);
  }

  /** Strip ← image through M (strip px → image px), blurred; returns pixel samples taken. */
  private rectify(image: Image, M: Mat3, mode: 'parity' | 'improved'): number {
    const { raw, valid } = this;
    for (let r = 0; r < STRIP_H; r++) {
      for (let c = 0; c < STRIP_W; c++) {
        const p = apply(M, c, r);
        const v = sampleLuma(image, p.x, p.y);
        const i = r * STRIP_W + c;
        if (Number.isNaN(v)) {
          raw[i] = mode === 'parity' ? 0 : Number.NaN;
          valid[i] = 0;
        } else {
          raw[i] = v;
          valid[i] = 1;
        }
      }
    }
    if (mode === 'improved') {
      // Fill out-of-frame pixels with the nearest valid value along the row so blurring and the
      // second derivative do not see a false edge at the image border.
      for (let r = 0; r < STRIP_H; r++) {
        const row = r * STRIP_W;
        let last = Number.NaN;
        for (let c = 0; c < STRIP_W; c++) {
          if (valid[row + c]) last = raw[row + c]!;
          else if (!Number.isNaN(last)) raw[row + c] = last;
        }
        last = Number.NaN;
        for (let c = STRIP_W - 1; c >= 0; c--) {
          if (valid[row + c]) last = raw[row + c]!;
          else if (Number.isNaN(raw[row + c]!)) raw[row + c] = Number.isNaN(last) ? 0 : last;
        }
      }
    }
    blur2D(raw, STRIP_W, STRIP_H, 1, this.tmp, this.strip);
    return STRIP_W * STRIP_H;
  }

  /** Bright vertical ridges: -d²I/dx² (step 3, wrapping like np.roll), clamped at 0. */
  private evidence(polarity: 'bright' | 'dark', mode: 'parity' | 'improved') {
    const { strip, d2, valid } = this;
    const sign = polarity === 'bright' ? -1 : 1;
    for (let r = 0; r < STRIP_H; r++) {
      const row = r * STRIP_W;
      for (let c = 0; c < STRIP_W; c++) {
        const left = strip[row + ((c - 3 + STRIP_W) % STRIP_W)]!;
        const right = strip[row + ((c + 3) % STRIP_W)]!;
        let v = sign * (left + right - 2 * strip[row + c]!);
        if (mode === 'improved' && (!valid[row + c] || c < 3 || c >= STRIP_W - 3)) v = 0;
        d2[row + c] = v > 0 ? v : 0;
      }
    }
  }

  private bandProfile(yLo: number, yHi: number, sigma: number): Float32Array {
    const r0 = this.row(yLo);
    const r1 = this.row(yHi);
    const profile = new Float32Array(STRIP_W);
    const column = this.column;
    for (let c = 0; c < STRIP_W; c++) {
      let n = 0;
      for (let r = r0; r < r1; r++) column[n++] = this.d2[r * STRIP_W + c]!;
      profile[c] = median(column, n);
    }
    const blurred = blur1D(profile, new Float32Array(STRIP_W), sigma);
    const cap = 3 * (percentile(blurred, 90) + 1e-3);
    for (let c = 0; c < STRIP_W; c++) if (blurred[c]! > cap) blurred[c] = cap;
    return blurred;
  }

  /** Global 1-D alignment of the fret comb via three anchor frets (0, 7, 17). */
  combSearch(
    P: Float32Array,
    ranges: [number, number, number],
    steps: [number, number, number],
  ): number[] {
    const anchors = [0, 7, 17] as const;
    const { cols0, spacing } = this;
    const grids = anchors.map((a, i) =>
      Array.from(
        { length: steps[i]! },
        (_, k) => (-ranges[i]! + (2 * ranges[i]! * k) / (steps[i]! - 1)) * spacing[a]!,
      ),
    );
    const u = anchors.map((a) => cols0[a]!) as [number, number, number];
    let best = -Infinity;
    let bestMap: ((x: number) => number) | null = null;
    const candidates: { score: number; d: number[]; map: (x: number) => number }[] = [];
    let maxScore = 0;
    for (const d0 of grids[0]!) {
      for (const d1 of grids[1]!) {
        for (const d2 of grids[2]!) {
          let map: (x: number) => number;
          try {
            map = projective1D(u, [u[0] + d0, u[1] + d1, u[2] + d2]);
          } catch {
            continue;
          }
          let score = 0;
          let previous = map(cols0[0]!);
          let ok = true;
          for (let n = 1; n <= this.frets; n++) {
            const cp = map(cols0[n]!);
            const prevForOrder = n === 1 ? cp - 1 : previous;
            const valid = cp > 2 && cp < P.length - 3 && cp - prevForOrder > 0;
            if (valid) score += P[Math.min(P.length - 1, Math.max(0, pyRound(cp)))]!;
            if (!Number.isFinite(cp)) ok = false;
            previous = cp;
          }
          if (!ok) continue;
          candidates.push({ score, d: [d0, d1, d2], map });
          if (score > maxScore) maxScore = score;
        }
      }
    }
    for (const c of candidates) {
      const prior =
        1e-3 *
        (Math.abs(c.d[0]! / spacing[0]!) +
          Math.abs(c.d[1]! / spacing[7]!) +
          Math.abs(c.d[2]! / spacing[17]!)) *
        maxScore;
      const s = c.score - prior;
      if (s > best) {
        best = s;
        bestMap = c.map;
      }
    }
    const map = bestMap ?? ((x: number) => x);
    return cols0.map((c) => map(c));
  }

  refine(image: Image, H0: Mat3, options: RefineOptions = {}): RefineResult {
    const iterations = options.iterations ?? 5;
    const wide = options.wide ?? true;
    const mode = options.mode ?? 'improved';
    const polarity = options.polarity ?? 'bright';
    const { ky, xs, spacing, cols0, model } = this;
    let H = H0;
    let inliers = 0;
    let score = 0;
    let samples = 0;
    for (let it = 0; it < iterations; it++) {
      const M = multiply(H, this.Sinv);
      samples += this.rectify(image, M, mode);
      this.evidence(polarity, mode);
      const d2 = this.d2;
      const rc0 = this.row(-13);
      const rc1 = this.row(13);
      let bandCols: [number[], number[]];
      if (it === 0) {
        const [ranges, steps]: [[number, number, number], [number, number, number]] = wide
          ? [
              [0.45, 0.9, 1.6],
              [11, 19, 33],
            ]
          : [
              [0.2, 0.25, 0.3],
              [5, 7, 9],
            ];
        bandCols = [
          this.combSearch(this.bandProfile(-16, -4, 2), ranges, steps),
          this.combSearch(this.bandProfile(4, 16, 2), ranges, steps),
        ];
      } else {
        bandCols = [cols0, cols0];
      }
      const noiseBuf = d2.slice(rc0 * STRIP_W, rc1 * STRIP_W);
      const noise = median(noiseBuf) + 1e-3;
      const src: Pt[] = [];
      const dst: Pt[] = [];
      const weights: number[] = [];
      const window = new Float32Array(STRIP_H);
      for (let n = 0; n <= this.frets; n++) {
        const x = xs[n]!;
        const hw = halfWidth(model, x);
        const R = Math.max(2, Math.trunc(spacing[n]! * 0.22));
        const found: number[] = [];
        for (let bi = 0; bi < 2; bi++) {
          const band = bi === 0 ? -1 : 1;
          const c = bandCols[bi]![n]!;
          const c0 = pyRound(c) - R;
          const c1 = pyRound(c) + R + 1;
          if (c0 < 4 || c1 > STRIP_W - 4) continue;
          let [yLo, yHi] = [band * 0.15 * hw, band * 0.85 * hw].sort((a, b) => a - b) as [
            number,
            number,
          ];
          if (it === 0)
            [yLo, yHi] = [band * 4, band * 16].sort((a, b) => a - b) as [number, number];
          const r0 = this.row(yLo);
          const r1 = this.row(yHi);
          const profile: number[] = [];
          for (let cc = c0; cc < c1; cc++) {
            let m = 0;
            for (let r = r0; r < r1; r++) window[m++] = d2[r * STRIP_W + cc]!;
            profile.push(median(window, m));
          }
          let k = 0;
          for (let i = 1; i < profile.length; i++) if (profile[i]! > profile[k]!) k = i;
          const peak = profile[k]!;
          if (peak < 4 * noise || peak < 1.5) continue;
          let offset = 0;
          if (k > 0 && k < profile.length - 1) {
            const den = profile[k - 1]! - 2 * profile[k]! + profile[k + 1]!;
            if (den < 0) offset = (0.5 * (profile[k - 1]! - profile[k + 1]!)) / den;
          }
          const cs = c0 + k + offset;
          const ym = 0.5 * (yLo + yHi);
          src.push({ x, y: ym });
          dst.push({ x: cs, y: (ym + SYH) * ky });
          weights.push(Math.min(peak / (8 * noise), 1));
          found.push(cs);
        }
        // Across-neck evidence: the fret wire ends exactly at the board edge.
        if (found.length === 2 && n >= 1) {
          const cs = pyRound(0.5 * (found[0]! + found[1]!));
          const E = new Float32Array(STRIP_H);
          for (let r = 0; r < STRIP_H; r++) {
            let s = 0;
            let m = 0;
            for (let cc = Math.max(0, cs - 1); cc < Math.min(STRIP_W, cs + 2); cc++) {
              s += d2[r * STRIP_W + cc]!;
              m++;
            }
            E[r] = m ? s / m : 0;
          }
          const Eb = blur1D(E, new Float32Array(STRIP_H), 1.2);
          const inside =
            median(Array.from(Eb.subarray(this.row(-0.6 * hw), this.row(0.6 * hw)))) + 1e-3;
          for (const sgn of [-1, 1]) {
            const re = (sgn * hw + SYH) * ky;
            const Rr = Math.trunc((it === 0 ? 13 : 5) * ky);
            let best = 0;
            let bestR: number | null = null;
            for (let r = Math.trunc(re) - Rr; r <= Math.trunc(re) + Rr; r++) {
              if (r - 5 < 0 || r + 5 >= STRIP_H) continue;
              const ins = sgn < 0 ? mean(Eb, r, r + 5) : mean(Eb, r - 4, r + 1);
              const out = sgn < 0 ? mean(Eb, r - 5, r) : mean(Eb, r + 1, r + 6);
              const contrast = (ins - out) / inside;
              if (contrast > best) {
                best = contrast;
                bestR = r;
              }
            }
            if (bestR !== null && best > 0.45) {
              src.push({ x, y: sgn * hw });
              dst.push({ x: cs, y: bestR + (sgn < 0 ? -0.5 : 0.5) });
              weights.push(0.6);
            }
          }
        }
      }
      if (src.length < 14) return { H: H0, inliers: 0, score: 0, samples };
      const dstImage = dst.map((p) => apply(M, p.x, p.y));
      let w = weights.slice();
      let Hn = H;
      for (let round = 0; round < 4; round++) {
        Hn = fitHomography(src, dstImage, w);
        const residuals = src.map((p, i) => {
          const q = apply(Hn, p.x, p.y);
          return Math.hypot(q.x - dstImage[i]!.x, q.y - dstImage[i]!.y);
        });
        const scale = 1.4826 * median(residuals.slice()) + 0.5;
        w = weights.map((w0, i) => {
          const r = residuals[i]!;
          return r < 3 * scale ? w0 * (1 - (r / (3 * scale)) ** 2) ** 2 : 0;
        });
        if (w.filter((v) => v > 0).length < 12) return { H: H0, inliers: 0, score: 0, samples };
      }
      H = Hn;
      inliers = w.filter((v) => v > 0).length;
      score = w.reduce((a, b) => a + b, 0);
    }
    return { H, inliers, score, samples };
  }
}

function mean(values: Float32Array, from: number, to: number): number {
  let s = 0;
  for (let i = from; i < to; i++) s += values[i]!;
  return s / (to - from);
}

/** Worst error over frets 0..maxFret at three across positions, in fret spacings and string spacings. */
export function trackingError(
  H: Mat3,
  truth: Mat3,
  model: InstrumentModel,
  maxFret = 17,
): { along: number; across: number } {
  const inverse = invert(H);
  let along = 0;
  let across = 0;
  for (let n = 0; n <= maxFret; n++) {
    const x = fretX(model, n);
    const sp = fretX(model, n + 1) - x;
    for (const y of [-14, 0, 14]) {
      const p = apply(truth, x, y);
      const q = apply(inverse, p.x, p.y);
      along = Math.max(along, Math.abs(q.x - x) / sp);
      across = Math.max(across, Math.abs(q.y - y) / 7);
    }
  }
  return { along, across };
}

export const isSuccess = (e: { along: number; across: number }) =>
  e.along < 0.25 && e.across < 0.35;
