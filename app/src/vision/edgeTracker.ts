/**
 * EdgeTracker: refines a rough board→image homography by measuring the fret wires and board edges
 * in a rectified strip (docs/specs/01-vision.md §4). Port of ml/synth/reference_tracker.py
 * ("parity" mode reproduces it); the improved mode adds the steps of task 3.4.
 *
 * Board coordinates are millimetres (spec §1). The strip covers x ∈ [-14, end + 6] mm and
 * y ∈ [-36, 36] mm at STRIP_W × STRIP_H pixels.
 */
import { fretX, halfWidth, stringY, type InstrumentModel } from '@core/guitar/instrument';
import {
  apply,
  controlPointsPx,
  fitHomography,
  fitCorrectionFromLines,
  IDENTITY,
  invert,
  multiply,
  normalize,
  projective1D,
  type Mat3,
  type Pt,
} from './geometry';
import type { Image } from './image';
import { blur1D, blur2D, median, percentile } from './signal';

export const STRIP_W = 768;
export const STRIP_H = 128;
/** Strip half-height in mm: the reference tracker's ±36, and wider for the improved mode so both
 * board edges of a classical neck stay inside with room to search. */
const SYH_PARITY = 36;
const SYH_IMPROVED = 48;

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
  /** Use the six strings as an across-neck cue (improved mode only). Default true. */
  strings?: boolean;
  /** Use where fret wires end as an across-neck cue. Default: on in parity mode, off in improved mode. */
  fretEnds?: boolean;
  /**
   * How strongly the fit holds the perspective of the starting estimate (relative to the fret wire
   * evidence). Default: weak for a wide search (a lock from taps must correct their perspective
   * error), strong for frame-to-frame tracking (perspective changes little between frames, and
   * letting a partly hidden board re-estimate it each frame makes the grid slide; D-022).
   */
  perspectiveDamping?: { along: number; across: number; shear?: number };
  /** Stop after the second round once a round moves no control point by more than this (px). */
  settlePx?: number;
  /** Return the last strip and the measurements made on it (for debugging). */
  debug?: boolean;
}

const LOCK_DAMPING = { along: 0.01, across: 0.05 };
const TRACK_DAMPING = { along: 1, across: 5, shear: 3 };
/** Residual within which a measurement counts as agreeing with a fit (board mm). */
const AGREE_X_MM = 1;
const AGREE_Y_MM = 0.6;

export interface RefineResult {
  H: Mat3;
  /** Measurements kept by the robust fit in the last round (0 = failed, H unchanged). */
  inliers: number;
  /** Sum of the robust weights in the last round. */
  score: number;
  /** Number of image pixel samples taken (cost proxy, gate G3.5). */
  samples: number;
  debug?: {
    strip: Float32Array;
    /** Strip px → image px for the strip above. */
    M: Mat3;
    frets: Pt[];
    fretBoard: Pt[];
    strings: Pt[];
    stringBoard: Pt[];
  };
}

/** Python's round(): halves go to the even neighbour. */
export function pyRound(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

const lumaPlanes = new WeakMap<object, Float32Array>();

/** The frame as one luma channel (cached per frame buffer). */
function lumaImage(image: Image): Image {
  let plane = lumaPlanes.get(image.data);
  if (!plane) {
    const { data } = image;
    plane = new Float32Array(image.width * image.height);
    for (let i = 0, k = 0; i < plane.length; i++, k += 4)
      plane[i] = 0.299 * data[k]! + 0.587 * data[k + 1]! + 0.114 * data[k + 2]!;
    lumaPlanes.set(image.data, plane);
  }
  return {
    width: image.width,
    height: image.height,
    data: plane as unknown as Uint8Array,
    channels: 1,
  };
}

export class EdgeTracker {
  readonly frets: number;
  readonly sx0: number;
  readonly sx1: number;
  readonly kx: number;
  private syh = SYH_PARITY;
  ky = STRIP_H / (2 * SYH_PARITY);
  S: Mat3;
  Sinv: Mat3;
  readonly xs: number[];
  readonly cols0: number[];
  readonly spacing: number[];
  private readonly raw = new Float32Array(STRIP_W * STRIP_H);
  private readonly tmp = new Float32Array(STRIP_W * STRIP_H);
  private readonly strip = new Float32Array(STRIP_W * STRIP_H);
  private readonly d2 = new Float32Array(STRIP_W * STRIP_H);
  private readonly valid = new Uint8Array(STRIP_W * STRIP_H);
  private readonly column = new Float32Array(STRIP_H);
  private readonly scratchA = new Float32Array(STRIP_W);
  private readonly scratchB = new Float32Array(STRIP_W);

  constructor(readonly model: InstrumentModel) {
    this.frets = model.fretCount;
    this.sx0 = -14;
    this.sx1 = fretX(model, model.fretCount) + 6 + 6;
    this.kx = STRIP_W / (this.sx1 - this.sx0);
    this.S = IDENTITY;
    this.Sinv = IDENTITY;
    this.setStripHeight(SYH_PARITY);
    this.xs = Array.from({ length: this.frets + 1 }, (_, n) => fretX(model, n));
    this.cols0 = this.xs.map((x) => (x - this.sx0) * this.kx);
    this.spacing = this.cols0.map((c, n) =>
      n < this.frets ? this.cols0[n + 1]! - c : this.cols0[n]! - this.cols0[n - 1]!,
    );
  }

  private setStripHeight(syh: number): void {
    if (syh === this.syh && this.S !== IDENTITY) return;
    this.syh = syh;
    this.ky = STRIP_H / (2 * syh);
    this.S = [this.kx, 0, -this.sx0 * this.kx, 0, this.ky, STRIP_H / 2, 0, 0, 1];
    this.Sinv = invert(this.S);
  }

  private row(yMm: number): number {
    return Math.trunc((yMm + this.syh) * this.ky);
  }

  /** Strip ← image through M (strip px → image px), blurred; returns pixel samples taken. */
  private rectify(colour: Image, M: Mat3, mode: 'parity' | 'improved'): number {
    const { raw, valid } = this;
    // Colour frames are read through a luma plane made once per frame (each strip pixel needs four
    // image pixels, three rounds a frame: converting them every time cost a third of a tracking frame).
    const image = colour.channels === 4 ? lumaImage(colour) : colour;
    const { width, height, data, channels } = image;
    const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = M as unknown as number[] as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const outside = mode === 'parity' ? 0 : Number.NaN;
    const rgba = channels === 4;
    const rowStride = width * channels;
    for (let r = 0; r < STRIP_H; r++) {
      for (let c = 0; c < STRIP_W; c++) {
        // Same arithmetic as apply() + sampleLuma(), without allocating per pixel.
        const w = m6 * c + m7 * r + m8;
        const x = (m0 * c + m1 * r + m2) / w;
        const y = (m3 * c + m4 * r + m5) / w;
        const i = r * STRIP_W + c;
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        if (x0 < 0 || y0 < 0 || x0 >= width - 1 || y0 >= height - 1) {
          if (x0 === width - 1 && y0 >= 0 && y0 < height && x === x0) {
            const k = (Math.min(y0, height - 1) * width + x0) * channels;
            raw[i] = rgba
              ? 0.299 * data[k]! + 0.587 * data[k + 1]! + 0.114 * data[k + 2]!
              : data[k]!;
            valid[i] = 1;
          } else {
            raw[i] = outside;
            valid[i] = 0;
          }
          continue;
        }
        const fx = x - x0;
        const fy = y - y0;
        const k = (y0 * width + x0) * channels;
        let a: number, b: number, cc: number, d: number;
        if (rgba) {
          const k2 = k + rowStride;
          a = 0.299 * data[k]! + 0.587 * data[k + 1]! + 0.114 * data[k + 2]!;
          b = 0.299 * data[k + 4]! + 0.587 * data[k + 5]! + 0.114 * data[k + 6]!;
          cc = 0.299 * data[k2]! + 0.587 * data[k2 + 1]! + 0.114 * data[k2 + 2]!;
          d = 0.299 * data[k2 + 4]! + 0.587 * data[k2 + 5]! + 0.114 * data[k2 + 6]!;
        } else {
          a = data[k]!;
          b = data[k + 1]!;
          cc = data[k + rowStride]!;
          d = data[k + rowStride + 1]!;
        }
        raw[i] = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
        valid[i] = 1;
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

  /**
   * Global 1-D alignment of the fret comb via three anchor frets (default 0, 7, 17; the search
   * grid for anchor i spans ±ranges[i] fret spacings in steps[i] steps).
   */
  combSearch(
    P: Float32Array,
    ranges: [number, number, number],
    steps: [number, number, number],
    anchors: readonly [number, number, number] = [0, 7, 17],
  ): number[] {
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
          Math.abs(c.d[1]! / spacing[anchors[1]]!) +
          Math.abs(c.d[2]! / spacing[anchors[2]]!)) *
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

  /**
   * String cue (spec §4.5): the six strings are thin ridges along the strip. Between frets, the row
   * profile of a horizontal-ridge filter is matched to the expected string pattern (offset and
   * scale), first per station, then along a robust line through all stations, then narrowly.
   * Returns correspondences board (x, stringY) ↔ strip (column, row).
   */
  private stringCue(
    maxFret: number,
    knownSign: 1 | -1 | null = null,
    colStep = 1,
  ): { src: Pt[]; dst: Pt[]; weights: number[]; sign: 1 | -1 } {
    const { strip, valid, ky, model, cols0, spacing } = this;
    const strings = model.strings;
    // Two-sided horizontal ridges: a string is lighter (sign 1) or darker (sign -1) than the board
    // on BOTH sides. A plain step, such as the board edge against the background, scores zero.
    const ridgeAt = (r: number, c: number, sign: number) => {
      const centre = strip[r * STRIP_W + c]!;
      const above = sign * (centre - strip[(r - 2) * STRIP_W + c]!);
      const below = sign * (centre - strip[(r + 2) * STRIP_W + c]!);
      const v = Math.min(above, below);
      return v > 0 ? v : 0;
    };
    // Board edges are wide steps; a thin string barely moves the mean of four rows either side.
    const wideStep = (r: number, c: number) => {
      let d = 0;
      for (let k = 2; k <= 5; k++)
        d += strip[(r + k) * STRIP_W + c]! - strip[(r - k) * STRIP_W + c]!;
      return Math.abs(d) / 4;
    };
    interface Station {
      x: number;
      col: number;
      profile: Float32Array;
      rows: number[];
      edges: Float32Array;
      edgeRows: [number, number];
    }
    const centreRow = this.syh * ky;
    const stations: Station[] = [];
    // Whether strings show lighter or darker than the board is decided on a refinement's first round;
    // later rounds of the same frame reuse it (half the work).
    for (const sign of knownSign ? [knownSign] : ([1, -1] as const)) {
      for (let n = 1; n <= maxFret; n++) {
        const a = cols0[n - 1]! + 0.25 * spacing[n - 1]!;
        const b = cols0[n]! - 0.25 * spacing[n - 1]!;
        const c0 = Math.max(3, Math.ceil(a));
        const c1 = Math.min(STRIP_W - 3, Math.floor(b));
        if (c1 - c0 < 3) continue;
        const profile = new Float32Array(STRIP_H);
        const edges = new Float32Array(STRIP_H);
        const column = this.scratchA;
        const steps = this.scratchB;
        let validCount = 0;
        for (let r = 2; r < STRIP_H - 2; r++) {
          let m = 0;
          for (let c = c0; c <= c1; c += colStep) {
            if (valid[r * STRIP_W + c]) validCount++;
            column[m] = ridgeAt(r, c, sign);
            steps[m++] = r >= 6 && r < STRIP_H - 6 ? wideStep(r, c) : 0;
          }
          // Typed scratch buffers: median sorts them in place, numerically, without copying.
          profile[r] = median(column, m);
          edges[r] = median(steps, m);
        }
        if (validCount < (0.6 * (c1 - c0 + 1) * (STRIP_H - 4)) / colStep) continue;
        // Each cue is scaled by its own peak so that neither dominates on contrast alone.
        normalizePeak(profile);
        normalizePeak(edges);
        const x = (0.5 * (a + b)) / this.kx + this.sx0;
        const rows = Array.from(
          { length: strings },
          (_, s) => (stringY(model, s + 1, x) + this.syh) * ky,
        );
        const hw = halfWidth(model, x);
        const edgeRows: [number, number] = [(-hw + this.syh) * ky, (hw + this.syh) * ky];
        stations.push({ x, col: 0.5 * (a + b), profile, rows, edges, edgeRows, sign } as Station & {
          sign: number;
        });
      }
    }
    if (stations.length < 3) return { src: [], dst: [], weights: [], sign: knownSign ?? 1 };

    // The string pattern repeats, so a shift by one string scores almost as well. "Guards" one
    // string-gap outside each outer string should be empty; a shifted fit puts a real string there.
    const scoreAt = (st: Station, t: number, k: number) => {
      let sum = 0;
      const at = (row: number) => {
        const r = Math.round(centreRow + k * (row - centreRow) + t);
        return r >= 0 && r < STRIP_H ? st.profile[r]! : 0;
      };
      for (const row of st.rows) sum += at(row);
      const first = st.rows[0]!;
      const last = st.rows[st.rows.length - 1]!;
      const gap = (last - first) / (st.rows.length - 1);
      sum -= at(first - gap) + at(last + gap);
      // The board edges sit at known positions outside the outer strings.
      const edgeAt = (row: number) => {
        const r = Math.round(centreRow + k * (row - centreRow) + t);
        let best = 0;
        for (let d = -1; d <= 1; d++) {
          const q = r + d;
          if (q >= 0 && q < STRIP_H && st.edges[q]! > best) best = st.edges[q]!;
        }
        return best;
      };
      sum += 1.5 * (edgeAt(st.edgeRows[0]) + edgeAt(st.edgeRows[1]));
      return sum;
    };
    const stringRows = (st: Station) => Math.abs(st.rows[0]! - st.rows[1]!);

    // Pass 1: each station on its own (wide), per polarity; keep the polarity that matches best overall.
    const fits = stations.map((st) => {
      const gap = stringRows(st);
      let best = { t: 0, k: 1, score: -1 };
      for (let k = 0.85; k <= 1.151; k += 0.05) {
        for (let t = -1.4 * gap; t <= 1.4 * gap; t += 0.5) {
          const sc = scoreAt(st, t, k) - 0.02 * Math.abs(t / gap) * 0;
          if (sc > best.score) best = { t, k, score: sc };
        }
      }
      return { st, ...best, sign: (st as Station & { sign: number }).sign };
    });
    const total = (sign: number) =>
      fits.filter((f) => f.sign === sign).reduce((a, f) => a + f.score, 0);
    const sign: 1 | -1 = knownSign ?? (total(1) >= total(-1) ? 1 : -1);
    const mine = fits.filter((f) => f.sign === sign && f.score > 0);
    if (mine.length < 3) return { src: [], dst: [], weights: [], sign };

    // Robust lines t(x) and k(x) through the stations (iteratively reweighted least squares).
    const line = (ys: number[], xs: number[], w0: number[]) => {
      let w = w0.slice();
      let a = 0;
      let b = 0;
      for (let iter = 0; iter < 6; iter++) {
        let sw = 0,
          sx = 0,
          sy = 0,
          sxx = 0,
          sxy = 0;
        xs.forEach((x, i) => {
          sw += w[i]!;
          sx += w[i]! * x;
          sy += w[i]! * ys[i]!;
          sxx += w[i]! * x * x;
          sxy += w[i]! * x * ys[i]!;
        });
        const det = sw * sxx - sx * sx;
        if (Math.abs(det) < 1e-9) {
          a = sy / (sw || 1);
          b = 0;
        } else {
          b = (sw * sxy - sx * sy) / det;
          a = (sy - b * sx) / sw;
        }
        const res = xs.map((x, i) => Math.abs(ys[i]! - (a + b * x)));
        const scale = 1.4826 * median(res.slice()) + 1e-6;
        w = w0.map((wi, i) =>
          res[i]! < 3 * scale ? wi * (1 - (res[i]! / (3 * scale)) ** 2) ** 2 : 0,
        );
      }
      return (x: number) => a + b * x;
    };
    const xsSt = mine.map((f) => f.st.x);
    const ws = mine.map((f) => f.score);
    const tLine = line(
      mine.map((f) => f.t),
      xsSt,
      ws,
    );
    const kLine = line(
      mine.map((f) => f.k),
      xsSt,
      ws,
    );

    // Pass 2: narrow search around the lines, then per-string sub-row peaks.
    const src: Pt[] = [];
    const dst: Pt[] = [];
    const weights: number[] = [];
    const edgeSrc: Pt[] = [];
    const edgeDst: Pt[] = [];
    const edgeWeights: number[] = [];
    /** Per station with both edges: how far the edges sit from where the string fit puts them. */
    const edgeShift: number[] = [];
    const subRow = (profile: Float32Array, r: number) => {
      const y0 = profile[r - 1]!,
        y1 = profile[r]!,
        y2 = profile[r + 1]!;
      const den = y0 - 2 * y1 + y2;
      return r + (den < 0 ? (0.5 * (y0 - y2)) / den : 0);
    };
    for (const f of mine) {
      const st = f.st;
      const gap = stringRows(st);
      const t0 = tLine(st.x);
      const k0 = kLine(st.x);
      let best = { t: t0, k: k0, score: -1 };
      for (let k = k0 - 0.03; k <= k0 + 0.031; k += 0.01)
        for (let t = t0 - 0.3 * gap; t <= t0 + 0.3 * gap; t += 0.25) {
          const sc = scoreAt(st, t, k);
          if (sc > best.score) best = { t, k, score: sc };
        }
      const noise = median(Array.from(st.profile)) + 1e-3;
      st.rows.forEach((row, s) => {
        const predicted = centreRow + best.k * (row - centreRow) + best.t;
        const r0 = Math.round(predicted);
        let r = r0;
        for (let d = -2; d <= 2; d++) {
          const q = r0 + d;
          if (q > 0 && q < STRIP_H - 1 && st.profile[q]! > st.profile[r]!) r = q;
        }
        const peak = st.profile[r]!;
        if (r <= 0 || r >= STRIP_H - 1 || peak < 3 * noise) return;
        const y0 = st.profile[r - 1]!,
          y1 = peak,
          y2 = st.profile[r + 1]!;
        const den = y0 - 2 * y1 + y2;
        const offset = den < 0 ? (0.5 * (y0 - y2)) / den : 0;
        src.push({ x: st.x, y: stringY(model, s + 1, st.x) });
        dst.push({ x: st.col, y: r + offset });
        weights.push(0.4 * Math.min(1, peak / (6 * noise)));
      });
      // Board edges near where this fit puts them. The visible edge can be the neck's side a
      // millimetre or two outside the fretboard, the same on both sides, so only their midpoint
      // (board y = 0) is used.
      const found: { y: number; shift: number; strength: number }[] = [];
      for (const row of st.edgeRows) {
        const predicted = centreRow + best.k * (row - centreRow) + best.t;
        const r0 = Math.round(predicted);
        let r = -1;
        for (let d = -6; d <= 6; d++) {
          const q = r0 + d;
          if (q <= 0 || q >= STRIP_H - 1) continue;
          const v = st.edges[q]!;
          if (v >= st.edges[q - 1]! && v >= st.edges[q + 1]! && (r < 0 || v > st.edges[r]!)) r = q;
        }
        if (r < 0 || st.edges[r]! < 0.3) break;
        const y = subRow(st.edges, r);
        found.push({ y, shift: y - predicted, strength: st.edges[r]! });
      }
      if (found.length === 2) {
        const [a, b] = found as [(typeof found)[0], (typeof found)[0]];
        edgeShift.push(0.5 * (a.shift + b.shift));
        edgeSrc.push({ x: st.x, y: 0 });
        edgeDst.push({ x: st.col, y: 0.5 * (a.y + b.y) });
        edgeWeights.push(0.8 * Math.min(1, Math.min(a.strength, b.strength) / 0.6));
      }
    }
    // Strings can be found by their shadow or highlight rather than the string itself, which
    // moves every string the same way. When both board edges agree on a common offset, take it.
    if (edgeShift.length >= 5) {
      const shift = median(edgeShift.slice());
      const spread = 1.4826 * median(edgeShift.map((v) => Math.abs(v - shift)));
      if (spread < 1.5) for (const p of dst) p.y += shift;
    }
    return {
      src: [...src, ...edgeSrc],
      dst: [...dst, ...edgeDst],
      weights: [...weights, ...edgeWeights],
      sign,
    };
  }

  refine(image: Image, H0: Mat3, options: RefineOptions = {}): RefineResult {
    const iterations = options.iterations ?? 5;
    const wide = options.wide ?? true;
    const mode = options.mode ?? 'improved';
    const polarity = options.polarity ?? 'bright';
    this.setStripHeight(mode === 'parity' ? SYH_PARITY : SYH_IMPROVED);
    const { ky, xs, spacing, cols0, model } = this;
    let H = H0;
    let inliers = 0;
    let stringSign: 1 | -1 | null = null;
    let score = 0;
    let samples = 0;
    let debugInfo: RefineResult['debug'];
    // Measurements too few or an update too large: a failed first round fails the refinement;
    // a later one keeps what the earlier rounds found (improved mode).
    let it = 0;
    const stop = (): RefineResult =>
      it === 0 || mode === 'parity'
        ? { H: H0, inliers: 0, score: 0, samples }
        : { H, inliers, score, samples, ...(debugInfo ? { debug: debugInfo } : {}) };
    const nutPx = (G: Mat3) => {
      const [a, b] = controlPointsPx(G, model);
      return Math.hypot(b!.x - a!.x, b!.y - a!.y);
    };
    for (; it < iterations; it++) {
      const M = multiply(H, this.Sinv);
      samples += this.rectify(image, M, mode);
      this.evidence(polarity, mode);
      const d2 = this.d2;
      const rc0 = this.row(-13);
      const rc1 = this.row(13);
      let bandCols: [number[], number[]];
      if (it === 0) {
        type Triple = [number, number, number];
        let [ranges, steps, anchors]: [Triple, Triple, Triple] = wide
          ? [
              [0.45, 0.9, 1.6],
              [11, 19, 33],
              [0, 7, 17],
            ]
          : [
              [0.2, 0.25, 0.3],
              [5, 7, 9],
              [0, 7, 17],
            ];
        if (wide && mode === 'improved') {
          // A lock starts from taps at the nut and the 12th fret, so those are known to within a
          // fraction of a spacing; tap noise shows up as perspective, which bends the comb most
          // in between (fret 7 is off by up to ~2 spacings at σ = 8 px, fret 17 by far more).
          [ranges, steps, anchors] = [
            [0.5, 2.2, 0.6],
            [11, 45, 13],
            [0, 7, 12],
          ];
        }
        bandCols = [
          this.combSearch(this.bandProfile(-16, -4, 2), ranges, steps, anchors),
          this.combSearch(this.bandProfile(4, 16, 2), ranges, steps, anchors),
        ];
      } else if (mode === 'improved') {
        // Re-run a narrow comb each round: a fret matched to its neighbour in round 0 is corrected.
        const r: [number, number, number] = [0.2, 0.25, 0.3];
        const st: [number, number, number] = [5, 7, 9];
        bandCols = [
          this.combSearch(this.bandProfile(-16, -4, 2), r, st),
          this.combSearch(this.bandProfile(4, 16, 2), r, st),
        ];
      } else {
        bandCols = [cols0, cols0];
      }
      const noiseBuf = d2.slice(rc0 * STRIP_W, rc1 * STRIP_W);
      const noise = median(noiseBuf) + 1e-3;
      const src: Pt[] = [];
      const dst: Pt[] = [];
      const weights: number[] = [];
      /** Which board coordinate each measurement pins down (used by the improved fit). */
      const axes: ('x' | 'y')[] = [];
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
          dst.push({ x: cs, y: (ym + this.syh) * ky });
          weights.push(Math.min(peak / (8 * noise), 1));
          axes.push('x');
          found.push(cs);
        }
        // Across-neck evidence: the fret wire ends exactly at the board edge.
        if (found.length === 2 && n >= 1 && (options.fretEnds ?? mode === 'parity')) {
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
            const re = (sgn * hw + this.syh) * ky;
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
              axes.push('y');
            }
          }
        }
      }
      const fretPointsStrip = dst.slice();
      let stringPointsStrip: Pt[] = [];
      let stringBoard: Pt[] = [];
      if (mode === 'improved' && (options.strings ?? true)) {
        // Tracking reads every second column between frets (the profile is a median across them;
        // lag work 2026-11-19: half the cost, no loss on the benches); a lock reads them all.
        const cue = this.stringCue(
          Math.min(15, this.frets),
          it === 0 ? null : stringSign,
          wide ? 1 : 2,
        );
        stringSign = cue.sign;
        stringPointsStrip = cue.dst;
        stringBoard = cue.src;
        src.push(...cue.src);
        dst.push(...cue.dst);
        weights.push(...cue.weights);
        for (let i = 0; i < cue.src.length; i++) axes.push('y');
      }
      if (src.length < 14) return stop();
      const dstImage = dst.map((p) => apply(M, p.x, p.y));
      let w = weights.slice();
      let Hn = H;
      const yCount = axes.filter((a) => a === 'y').length;
      if (mode === 'improved' && yCount >= 8) {
        // A fret wire says where along the neck a pixel is, and nothing about across; a string says
        // where across and nothing about along. Using their measured points as full 2-D
        // correspondences would pin the other coordinate to the current estimate. The fit is a
        // board-space correction of the current estimate, solved so that misread strings cannot tilt
        // the fret wires through the shared perspective (field test 2026-11-18, DECISIONS D-022).
        const G0 = invert(H);
        const board = dstImage.map((p) => apply(G0, p.x, p.y));
        const damping = options.perspectiveDamping ?? (wide ? LOCK_DAMPING : TRACK_DAMPING);
        const residualsOf = (G: Mat3) =>
          dstImage.map((p, i) => {
            const b = apply(G, p.x, p.y);
            return axes[i] === 'x' ? Math.abs(b.x - src[i]!.x) : Math.abs(b.y - src[i]!.y);
          });
        const robustFit = (share: number): { G: Mat3; w: number[] } | null => {
          let G = G0;
          let wr = weights.slice();
          for (let round = 0; round < 4; round++) {
            try {
              G = multiply(
                fitCorrectionFromLines(
                  board.map((b, i) =>
                    axes[i] === 'x'
                      ? { b, x: src[i]!.x, weight: wr[i]! }
                      : { b, y: src[i]!.y, weight: wr[i]! },
                  ),
                  damping,
                  share,
                ),
                G0,
              );
            } catch {
              return null;
            }
            const residuals = residualsOf(G);
            // Along and across residuals have different sizes; each gets its own robust scale.
            const scaleOf = (axis: 'x' | 'y') =>
              1.4826 * median(residuals.filter((_, i) => axes[i] === axis)) + 0.25;
            const scales = { x: scaleOf('x'), y: scaleOf('y') };
            wr = weights.map((w0, i) => {
              const r = residuals[i]!;
              const scale = scales[axes[i]!];
              return r < 3 * scale ? w0 * (1 - (r / (3 * scale)) ** 2) ** 2 : 0;
            });
            const kept = (axis: 'x' | 'y') => wr.filter((v, i) => v > 0 && axes[i] === axis).length;
            if (kept('x') < 8 || kept('y') < 6) return null;
          }
          return { G, w: wr };
        };
        // While tracking, the strings may also correct the perspective (share 1), which a light
        // board with dark wires needs to stay on; on a real guitar with faint strings that coupling
        // twists the grid (share 0). Both are tried and the fit more measurements agree with, at a
        // fixed tolerance, is kept (field test 2026-11-18, DECISIONS D-022).
        const shares = wide ? [0] : [0, 1];
        let best: { G: Mat3; w: number[]; agree: number } | null = null;
        for (const share of shares) {
          const fit = robustFit(share);
          if (!fit) continue;
          const residuals = residualsOf(fit.G);
          let agree = 0;
          residuals.forEach((r, i) => {
            const tol = axes[i] === 'x' ? AGREE_X_MM : AGREE_Y_MM;
            if (r < tol) agree += weights[i]! * (1 - (r / tol) ** 2) ** 2;
          });
          if (!best || agree > best.agree) best = { ...fit, agree };
        }
        if (!best) return stop();
        const G = best.G;
        w = best.w;
        try {
          Hn = normalize(invert(G));
        } catch {
          return stop();
        }
      } else
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
          if (w.filter((v) => v > 0).length < 12) return stop();
        }
      let moved = Infinity;
      if (mode === 'improved') {
        // No round moves a control point by more than the nut's width (twice that when locking).
        const before = controlPointsPx(H, model);
        const after = controlPointsPx(Hn, model);
        const limit = (it === 0 ? 2 : 1) * nutPx(H);
        moved = Math.max(
          ...after.map((p, i) => Math.hypot(p.x - before[i]!.x, p.y - before[i]!.y)),
        );
        if (!(moved < limit)) return stop();
      }
      H = Hn;
      inliers = w.filter((v) => v > 0).length;
      score = w.reduce((a, b) => a + b, 0);
      if (options.debug)
        debugInfo = {
          strip: this.strip.slice(),
          M,
          frets: fretPointsStrip,
          fretBoard: src.slice(0, fretPointsStrip.length),
          strings: stringPointsStrip,
          stringBoard,
        };
      // Settled: a round after the first that moved no control point by more than `settlePx` ends the
      // refinement early (lag work, 2026-11-19: on a steady guitar the third round changes nothing).
      const settle = options.settlePx ?? 0;
      if (it >= 1 && settle > 0 && moved < settle) {
        it++;
        break;
      }
    }
    return { H, inliers, score, samples, ...(debugInfo ? { debug: debugInfo } : {}) };
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

function normalizePeak(values: Float32Array): void {
  let peak = 0;
  for (const v of values) if (v > peak) peak = v;
  if (peak > 0) for (let i = 0; i < values.length; i++) values[i] = values[i]! / peak;
}
