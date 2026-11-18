/**
 * Planar geometry for the camera overlay (docs/specs/01-vision.md §1, §4).
 * A homography H maps board millimetres to image pixels: [u, v, w] = H · [x, y, 1], p = (u/w, v/w).
 * Matrices are row-major arrays of 9 numbers. Pure; no DOM.
 */
import { fretX, halfWidth, type InstrumentModel } from '@core/guitar/instrument';

export type Mat3 = number[];
export interface Pt {
  x: number;
  y: number;
}

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function apply(H: Mat3, x: number, y: number): Pt {
  const w = H[6]! * x + H[7]! * y + H[8]!;
  return { x: (H[0]! * x + H[1]! * y + H[2]!) / w, y: (H[3]! * x + H[4]! * y + H[5]!) / w };
}

export function multiply(A: Mat3, B: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      out[r * 3 + c] = A[r * 3]! * B[c]! + A[r * 3 + 1]! * B[3 + c]! + A[r * 3 + 2]! * B[6 + c]!;
  return out;
}

export function invert(H: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = H as [
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
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) throw new Error('singular homography');
  const inv = [
    A,
    -(b * i - c * h),
    b * f - c * e,
    B,
    a * i - c * g,
    -(a * f - c * d),
    C,
    -(a * h - b * g),
    a * e - b * d,
  ];
  return inv.map((v) => v / det);
}

export function normalize(H: Mat3): Mat3 {
  const s = H[8]!;
  return Math.abs(s) > 1e-12 ? H.map((v) => v / s) : H.slice();
}

/** Solve A·x = b (n×n, row-major) by Gaussian elimination with partial pivoting. */
export function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    if (Math.abs(M[pivot]![col]!) < 1e-14) throw new Error('singular system');
    [M[col], M[pivot]] = [M[pivot]!, M[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const k = M[r]![col]! / M[col]![col]!;
      if (k === 0) continue;
      for (let c = col; c <= n; c++) M[r]![c]! -= k * M[col]![c]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/** Exact homography through four point pairs (like OpenCV getPerspectiveTransform). */
export function fromFourPoints(src: Pt[], dst: Pt[]): Mat3 {
  if (src.length !== 4 || dst.length !== 4) throw new Error('need four point pairs');
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solve(A, b), 1];
}

/** Eigen-decomposition of a symmetric matrix (cyclic Jacobi). Returns eigenvalues and column eigenvectors. */
export function symmetricEigen(S: number[][]): { values: number[]; vectors: number[][] } {
  const n = S.length;
  const A = S.map((row) => row.slice());
  const V: number[][] = [];
  for (let i = 0; i < n; i++) V.push(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p]![q]! ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p]![q]!;
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (A[q]![q]! - A[p]![p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k]![p]!;
          const akq = A[k]![q]!;
          A[k]![p] = c * akp - s * akq;
          A[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p]![k]!;
          const aqk = A[q]![k]!;
          A[p]![k] = c * apk - s * aqk;
          A[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k]![p]!;
          const vkq = V[k]![q]!;
          V[k]![p] = c * vkp - s * vkq;
          V[k]![q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: A.map((row, i) => row[i]!), vectors: V };
}

function normalizer(points: Pt[], weights: number[]): Mat3 {
  let sw = 0;
  let mx = 0;
  let my = 0;
  points.forEach((p, i) => {
    sw += weights[i]!;
    mx += weights[i]! * p.x;
    my += weights[i]! * p.y;
  });
  mx /= sw;
  my /= sw;
  let d = 0;
  points.forEach((p, i) => (d += weights[i]! * Math.hypot(p.x - mx, p.y - my)));
  const s = Math.SQRT2 / (d / sw || 1);
  return [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1];
}

/**
 * Weighted least-squares homography (DLT with Hartley normalisation), src board mm → dst image px.
 * Needs at least four points with positive weight, not all on a line.
 */
export function fitHomography(src: Pt[], dst: Pt[], weights?: number[]): Mat3 {
  const w = weights ?? src.map(() => 1);
  const Ts = normalizer(src, w);
  const Td = normalizer(dst, w);
  const ATA = Array.from({ length: 9 }, () => new Array<number>(9).fill(0));
  const addRow = (row: number[], weight: number) => {
    for (let i = 0; i < 9; i++) {
      if (row[i] === 0) continue;
      for (let j = 0; j < 9; j++) ATA[i]![j]! += weight * row[i]! * row[j]!;
    }
  };
  for (let k = 0; k < src.length; k++) {
    if (!(w[k]! > 0)) continue;
    const a = apply(Ts, src[k]!.x, src[k]!.y);
    const b = apply(Td, dst[k]!.x, dst[k]!.y);
    addRow([-a.x, -a.y, -1, 0, 0, 0, b.x * a.x, b.x * a.y, b.x], w[k]!);
    addRow([0, 0, 0, -a.x, -a.y, -1, b.y * a.x, b.y * a.y, b.y], w[k]!);
  }
  const { values, vectors } = symmetricEigen(ATA);
  let smallest = 0;
  for (let i = 1; i < 9; i++) if (values[i]! < values[smallest]!) smallest = i;
  const h = vectors.map((row) => row[smallest]!);
  return normalize(multiply(multiply(invert(Td), h), Ts));
}

/**
 * A measurement that fixes one board coordinate of an image point: a fret wire tells where along
 * the neck a pixel is (`x`), a string or board edge where across (`y`). Board mm, image px.
 */
export interface LineConstraint {
  p: Pt;
  x?: number;
  y?: number;
  weight: number;
}

/**
 * Weighted DLT for the image → board homography G from one-coordinate constraints
 * (each gives one linear equation g_i·p − X·g_3·p = 0). Needs the constraints to pin both board
 * axes: at least four distinct `x` lines and some `y` lines, or the reverse.
 */
export function fitInverseFromLines(constraints: LineConstraint[]): Mat3 {
  const used = constraints.filter((c) => c.weight > 0);
  const Ti = normalizer(
    used.map((c) => c.p),
    used.map((c) => c.weight),
  );
  const axis = (key: 'x' | 'y') => {
    let sw = 0;
    let m = 0;
    for (const c of used) {
      const v = c[key];
      if (v === undefined) continue;
      sw += c.weight;
      m += c.weight * v;
    }
    m = sw ? m / sw : 0;
    let d = 0;
    for (const c of used) if (c[key] !== undefined) d += c.weight * Math.abs(c[key] - m);
    return { m, s: sw && d ? sw / d : 1 };
  };
  const ax = axis('x');
  const ay = axis('y');
  const Tb: Mat3 = [ax.s, 0, -ax.s * ax.m, 0, ay.s, -ay.s * ay.m, 0, 0, 1];
  const ATA = Array.from({ length: 9 }, () => new Array<number>(9).fill(0));
  for (const c of used) {
    const a = apply(Ti, c.p.x, c.p.y);
    const row = new Array<number>(9).fill(0);
    if (c.x !== undefined) {
      const X = ax.s * (c.x - ax.m);
      row.splice(0, 3, a.x, a.y, 1);
      row.splice(6, 3, -X * a.x, -X * a.y, -X);
    } else if (c.y !== undefined) {
      const Y = ay.s * (c.y - ay.m);
      row.splice(3, 3, a.x, a.y, 1);
      row.splice(6, 3, -Y * a.x, -Y * a.y, -Y);
    } else continue;
    for (let i = 0; i < 9; i++) {
      if (row[i] === 0) continue;
      for (let j = 0; j < 9; j++) ATA[i]![j]! += c.weight * row[i]! * row[j]!;
    }
  }
  const { values, vectors } = symmetricEigen(ATA);
  let smallest = 0;
  for (let i = 1; i < 9; i++) if (values[i]! < values[smallest]!) smallest = i;
  const g = vectors.map((row) => row[smallest]!) as Mat3;
  return normalize(multiply(multiply(invert(Tb), g), Ti));
}

/**
 * A one-coordinate constraint in board space: `b` is where the current estimate puts the measured
 * image point, `x` or `y` the board coordinate the measurement says it has.
 */
export interface BoardConstraint {
  b: Pt;
  x?: number;
  y?: number;
  weight: number;
}

/**
 * Board → board correction C (applied after the current image → board map) from one-coordinate
 * constraints, solved in two linear stages so that the two cues cannot twist each other:
 *  1. fret wires (`x`) fix the along-neck row and the perspective terms;
 *  2. strings and edges (`y`) fix the across-neck row, given that perspective.
 * Each fret wire is measured at two points across the board, so the wires alone pin their own
 * lines; the strings no longer pull on them through the shared perspective. The perspective terms
 * are damped towards "no change" (`damping`, relative to the total fret weight), so evidence that
 * barely constrains them, such as a slight convergence of the wires, cannot swing them.
 */
export function fitCorrectionFromLines(
  constraints: BoardConstraint[],
  damping: { along: number; across: number; shear?: number } = { along: 0.01, across: 0.05 },
  acrossShare = 0,
): Mat3 {
  const xs = constraints.filter((c) => c.weight > 0 && c.x !== undefined);
  const ys = constraints.filter((c) => c.weight > 0 && c.y !== undefined);
  if (xs.length < 4 || ys.length < 2) throw new Error('too few constraints');
  // Same normalisation for source and target, so the identity stays the identity.
  const stat = (values: number[], weights: number[]) => {
    let sw = 0;
    let m = 0;
    values.forEach((v, i) => ((sw += weights[i]!), (m += weights[i]! * v)));
    m /= sw;
    let d = 0;
    values.forEach((v, i) => (d += weights[i]! * (v - m) ** 2));
    return { m, s: Math.sqrt(d / sw) || 1 };
  };
  const all = [...xs, ...ys];
  const sx = stat(
    all.map((c) => c.b.x),
    all.map((c) => c.weight),
  );
  const sy = stat(
    all.map((c) => c.b.y),
    all.map((c) => c.weight),
  );
  const nx = (v: number) => (v - sx.m) / sx.s;
  const ny = (v: number) => (v - sy.m) / sy.s;
  const wx = xs.reduce((a, c) => a + c.weight, 0);
  const wy = ys.reduce((a, c) => a + c.weight, 0);

  // Unknowns c0..c7 (c8 = 1). Fret wire: c0 bx + c1 by + c2 − X (c6 bx + c7 by) = X.
  // String/edge: c3 bx + c4 by + c5 − Y (c6 bx + c7 by) = Y.
  const A = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const r = new Array<number>(8).fill(0);
  const add = (row: number[], rhs: number, w: number) => {
    for (let i = 0; i < 8; i++) {
      if (row[i] === 0) continue;
      r[i]! += w * row[i]! * rhs;
      for (let j = 0; j < 8; j++) A[i]![j]! += w * row[i]! * row[j]!;
    }
  };
  for (const c of xs) {
    const bx = nx(c.b.x);
    const by = ny(c.b.y);
    const X = nx(c.x!);
    add([bx, by, 1, 0, 0, 0, -X * bx, -X * by], X, c.weight);
  }
  // The across rows always fix c3..c5. Their pull on the shared perspective terms is capped at
  // `acrossShare` of the fret wires' weight: split each row into a full-weight copy that sees the
  // perspective as fixed and a small copy that may move it.
  const share = acrossShare > 0 ? Math.min(1, (acrossShare * wx) / wy) : 0;
  const yRows: { row: number[]; rhs: number; w: number }[] = [];
  for (const c of ys) {
    const bx = nx(c.b.x);
    const by = ny(c.b.y);
    const Y = ny(c.y!);
    yRows.push({ row: [0, 0, 0, bx, by, 1, -Y * bx, -Y * by], rhs: Y, w: c.weight });
  }
  for (const { row, rhs, w } of yRows) add(row, rhs, share * w);
  A[6]![6]! += damping.along * wx;
  A[7]![7]! += damping.across * wx;
  // The wires' tilt across the board (an x-row term; in-plane rotation shows mostly in the y row).
  A[1]![1]! += (damping.shear ?? 0) * wx;
  // A tiny ridge keeps every term defined (e.g. wires seen in one band only).
  for (let i = 0; i < 8; i++) A[i]![i]! += 1e-9 * (wx + wy);
  const first = solve(A, r);
  const c6 = first[6]!;
  const c7 = first[7]!;

  // Across row given that perspective, from the full-weight across rows.
  const A2 = Array.from({ length: 3 }, () => new Array<number>(3).fill(0));
  const r2 = new Array<number>(3).fill(0);
  for (const { row, rhs, w } of yRows) {
    const bx = row[3]!;
    const by = row[4]!;
    const target = rhs * (c6 * bx + c7 * by + 1);
    const q = [bx, by, 1];
    for (let i = 0; i < 3; i++) {
      r2[i]! += w * q[i]! * target;
      for (let j = 0; j < 3; j++) A2[i]![j]! += w * q[i]! * q[j]!;
    }
  }
  // Across measurements taken at a single position along the neck cannot tell how the across
  // scale changes along it: a weak pull towards "unchanged" keeps that term defined.
  A2[0]![0]! += 1e-3 * wy;
  const [c3, c4, c5] = solve(A2, r2) as [number, number, number];
  const Cn: Mat3 = [first[0]!, first[1]!, first[2]!, c3, c4, c5, c6, c7, 1];
  const T: Mat3 = [1 / sx.s, 0, -sx.m / sx.s, 0, 1 / sy.s, -sy.m / sy.s, 0, 0, 1];
  return normalize(multiply(multiply(invert(T), Cn), T));
}

/** The four control points (spec §1): nut bass, nut treble, 12th-fret treble, 12th-fret bass. */
export function controlPointsMm(model: InstrumentModel): Pt[] {
  const x12 = fretX(model, 12);
  const w0 = halfWidth(model, 0);
  const w12 = halfWidth(model, x12);
  return [
    { x: 0, y: -w0 },
    { x: 0, y: w0 },
    { x: x12, y: w12 },
    { x: x12, y: -w12 },
  ];
}

export function controlPointsPx(H: Mat3, model: InstrumentModel): Pt[] {
  return controlPointsMm(model).map((p) => apply(H, p.x, p.y));
}

export function fromControlPoints(points: Pt[], model: InstrumentModel): Mat3 {
  return fromFourPoints(controlPointsMm(model), points);
}

/** Local linear map of H at (x, y): image px per board mm, as [[du/dx, du/dy], [dv/dx, dv/dy]]. */
export function jacobian(H: Mat3, x: number, y: number): [[number, number], [number, number]] {
  const w = H[6]! * x + H[7]! * y + H[8]!;
  const u = (H[0]! * x + H[1]! * y + H[2]!) / w;
  const v = (H[3]! * x + H[4]! * y + H[5]!) / w;
  return [
    [(H[0]! - u * H[6]!) / w, (H[1]! - u * H[7]!) / w],
    [(H[3]! - v * H[6]!) / w, (H[4]! - v * H[7]!) / w],
  ];
}

/** 1-D projective map f(t) = (a·t + b) / (g·t + 1) through three pairs (t_i → s_i). */
export function projective1D(
  t: [number, number, number],
  s: [number, number, number],
): (x: number) => number {
  const [a, b, g] = solve(
    t.map((ti, i) => [ti, 1, -ti * s[i]!]),
    [...s],
  ) as [number, number, number];
  return (x) => (a * x + b) / (g * x + 1);
}
