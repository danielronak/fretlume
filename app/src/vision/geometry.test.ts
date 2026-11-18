import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fretX, INSTRUMENTS } from '@core/guitar/instrument';
import {
  apply,
  controlPointsPx,
  fitCorrectionFromLines,
  fitHomography,
  fitInverseFromLines,
  fromControlPoints,
  fromFourPoints,
  IDENTITY,
  invert,
  jacobian,
  multiply,
  projective1D,
  symmetricEigen,
  type BoardConstraint,
  type LineConstraint,
  type Mat3,
  type Pt,
} from './geometry';

const electric = INSTRUMENTS.electric;
const close = (a: Pt, b: Pt, digits = 6) => {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
};

/** A homography like the ones the camera produces: neck across a 1280×720 frame, perspective. */
const H_REF: Mat3 = fromControlPoints(
  [
    { x: 1137.3, y: 235.0 },
    { x: 1154.0, y: 306.7 },
    { x: 599.7, y: 443.9 },
    { x: 585.0, y: 357.0 },
  ],
  electric,
);

const camera = fc
  .record({
    tx: fc.double({ min: 100, max: 1180, noNaN: true }),
    ty: fc.double({ min: 100, max: 620, noNaN: true }),
    angle: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
    scale: fc.double({ min: 1, max: 3, noNaN: true }),
    squash: fc.double({ min: 0.5, max: 1, noNaN: true }),
    g: fc.double({ min: -4e-4, max: 4e-4, noNaN: true }),
  })
  .map(({ tx, ty, angle, scale, squash, g }) => {
    const c = Math.cos(angle) * scale;
    const s = Math.sin(angle) * scale;
    return [c, -s * squash, tx, s, c * squash, ty, g, 0, 1] as Mat3;
  });

describe('geometry', () => {
  it('inverts and multiplies', () => {
    const raw = multiply(H_REF, invert(H_REF));
    const product = raw.map((v) => v / raw[8]!);
    product.forEach((v, i) => expect(v).toBeCloseTo(IDENTITY[i]!, 9));
  });

  it('round-trips points through H and its inverse', () => {
    fc.assert(
      fc.property(
        camera,
        fc.double({ min: -50, max: 500, noNaN: true }),
        fc.double({ min: -30, max: 30, noNaN: true }),
        (H, x, y) => {
          const p = apply(H, x, y);
          close(apply(invert(H), p.x, p.y), { x, y }, 6);
        },
      ),
    );
  });

  it('matches OpenCV getPerspectiveTransform', () => {
    // cv2.getPerspectiveTransform([[0,0],[1,0],[1,1],[0,1]], [[10,20],[110,25],[105,130],[8,120]])
    const H = fromFourPoints(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      [
        { x: 10, y: 20 },
        { x: 110, y: 25 },
        { x: 105, y: 130 },
        { x: 8, y: 120 },
      ],
    );
    // Printed by OpenCV 5.0 (ml/ environment) for these points.
    const opencv = [
      94.46507083536883, -1.7733268197361993, 10.0, 3.7420615534929165, 103.40009770395702, 20.0,
      -0.05031753786028334, 0.028334147532975085, 1.0,
    ];
    H.forEach((v, i) => expect(v).toBeCloseTo(opencv[i]!, 9));
  });

  it('control points round-trip and land where they were put', () => {
    const points = controlPointsPx(H_REF, electric);
    close(points[0]!, { x: 1137.3, y: 235.0 }, 6);
    close(points[2]!, { x: 599.7, y: 443.9 }, 6);
    fromControlPoints(points, electric).forEach((v, i) => expect(v).toBeCloseTo(H_REF[i]!, 9));
  });

  it('weighted DLT recovers H exactly from clean points and ignores zero-weight outliers', () => {
    fc.assert(
      fc.property(camera, (H) => {
        const src: Pt[] = [];
        for (let n = 0; n <= 20; n += 2)
          for (const y of [-20, 0, 20]) src.push({ x: fretX(electric, n), y });
        const dst = src.map((p) => apply(H, p.x, p.y));
        const weights = src.map(() => 1);
        // Corrupt two points but give them no weight.
        dst[3] = { x: dst[3]!.x + 80, y: dst[3]!.y - 50 };
        dst[7] = { x: dst[7]!.x - 60, y: dst[7]!.y + 40 };
        weights[3] = 0;
        weights[7] = 0;
        const fitted = fitHomography(src, dst, weights);
        for (const p of [
          { x: 0, y: 0 },
          { x: 400, y: 25 },
        ])
          close(apply(fitted, p.x, p.y), apply(H, p.x, p.y), 4);
      }),
      { numRuns: 50 },
    );
  });

  it('fits the inverse homography from fret lines (x only) and string lines (y only)', () => {
    fc.assert(
      fc.property(camera, (H) => {
        const constraints: LineConstraint[] = [];
        // Frets seen at rows that are NOT where the model thinks; only x is known.
        for (let n = 0; n <= 17; n++)
          for (const y of [-11, 9]) {
            const x = fretX(electric, n);
            constraints.push({ p: apply(H, x, y + 0.3 * n), x, weight: 1 });
          }
        // Strings seen at assorted positions along; only y is known.
        for (let s = 0; s < 6; s++)
          for (const x of [40, 150, 260, 330]) {
            const y = -17 + 6.8 * s;
            constraints.push({ p: apply(H, x + 7 * s, y), y, weight: 0.5 });
          }
        // An outlier with no weight.
        constraints.push({ p: { x: 5, y: 5 }, x: 900, weight: 0 });
        const G = fitInverseFromLines(constraints);
        const Hf = invert(G);
        for (const q of [
          { x: 0, y: -20 },
          { x: 380, y: 25 },
        ])
          close(apply(Hf, q.x, q.y), apply(H, q.x, q.y), 3);
      }),
      { numRuns: 50 },
    );
  });

  it('correction fit: recovers the camera from a nearby estimate (frets x only, strings y only)', () => {
    fc.assert(
      fc.property(camera, fc.double({ min: -0.03, max: 0.03, noNaN: true }), (H, e) => {
        // The current estimate is off by a small board-space homography E.
        const E: Mat3 = [1 + e, 0.2 * e, 3, 0.1 * e, 1 - e, -1.5, 2e-5, -1e-4, 1];
        const G0 = multiply(E, invert(H));
        const constraints: BoardConstraint[] = [];
        const add = (p: Pt, c: { x?: number; y?: number }, weight: number) =>
          constraints.push({ b: apply(G0, p.x, p.y), ...c, weight });
        for (let n = 0; n <= 17; n++)
          for (const y of [-11, 9]) {
            const x = fretX(electric, n);
            add(apply(H, x, y + 0.3 * n), { x }, 1);
          }
        for (let s = 0; s < 6; s++)
          for (const x of [40, 150, 260, 330]) {
            const y = -17 + 6.8 * s;
            add(apply(H, x + 7 * s, y), { y }, 0.5);
          }
        // Iterate as the tracker does (each round starts from the last estimate).
        let G = G0;
        for (let round = 0; round < 6; round++) {
          const C = fitCorrectionFromLines(
            constraints.map((c, i) => {
              const p = apply(invert(G0), c.b.x, c.b.y);
              return { ...c, b: apply(G, p.x, p.y), weight: constraints[i]!.weight };
            }),
          );
          G = multiply(C, G);
        }
        const Hf = invert(G);
        for (const q of [
          { x: 0, y: -20 },
          { x: 380, y: 25 },
        ])
          close(apply(Hf, q.x, q.y), apply(H, q.x, q.y), 1.5);
      }),
      { numRuns: 50 },
    );
  });

  it('correction fit: wrong string rows cannot tilt the fret wires', () => {
    // Frets measured exactly; the strings claim a scale and slant that do not exist.
    const constraints: BoardConstraint[] = [];
    for (let n = 0; n <= 15; n++)
      for (const y of [-11, 11])
        constraints.push({ b: { x: fretX(electric, n), y }, x: fretX(electric, n), weight: 1 });
    for (const x of [30, 120, 200, 280])
      for (let s = 0; s < 6; s++) {
        const y = -17 + 6.8 * s;
        constraints.push({ b: { x, y }, y: y * (1.3 + x / 500) + x / 40, weight: 1 });
      }
    const C = fitCorrectionFromLines(constraints);
    for (let n = 0; n <= 15; n++)
      for (const y of [-20, 0, 20])
        expect(apply(C, fretX(electric, n), y).x).toBeCloseTo(fretX(electric, n), 6);
  });

  it('least squares averages noise', () => {
    const src: Pt[] = [];
    for (let n = 0; n <= 20; n++)
      for (const y of [-18, -6, 6, 18]) src.push({ x: fretX(electric, n), y });
    let seed = 1;
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
    const dst = src.map((p) => {
      const q = apply(H_REF, p.x, p.y);
      return { x: q.x + noise(), y: q.y + noise() };
    });
    const fitted = fitHomography(src, dst);
    const p = apply(fitted, fretX(electric, 7), 0);
    const truth = apply(H_REF, fretX(electric, 7), 0);
    expect(Math.hypot(p.x - truth.x, p.y - truth.y)).toBeLessThan(0.5);
  });

  it('jacobian matches finite differences', () => {
    const J = jacobian(H_REF, 200, 10);
    const d = 1e-4;
    const p = apply(H_REF, 200, 10);
    const px = apply(H_REF, 200 + d, 10);
    const py = apply(H_REF, 200, 10 + d);
    expect(J[0][0]).toBeCloseTo((px.x - p.x) / d, 4);
    expect(J[1][0]).toBeCloseTo((px.y - p.y) / d, 4);
    expect(J[0][1]).toBeCloseTo((py.x - p.x) / d, 4);
    expect(J[1][1]).toBeCloseTo((py.y - p.y) / d, 4);
  });

  it('1-D projective map passes through its three pairs and stays projective', () => {
    const f = projective1D([0, 200, 400], [10, 300, 520]);
    expect(f(0)).toBeCloseTo(10, 9);
    expect(f(200)).toBeCloseTo(300, 9);
    expect(f(400)).toBeCloseTo(520, 9);
    // The x-axis of any homography is such a map; it must be reproduced exactly from three samples.
    const g = (x: number) => apply(H_REF, x, 0).x;
    const h = projective1D([0, 150, 380], [g(0), g(150), g(380)]);
    expect(h(260)).toBeCloseTo(g(260), 6);
  });

  it('symmetric eigen-decomposition reconstructs the matrix', () => {
    const S = [
      [4, 1, 2],
      [1, 3, 0],
      [2, 0, 5],
    ];
    const { values, vectors } = symmetricEigen(S);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        let sum = 0;
        for (let k = 0; k < 3; k++) sum += vectors[i]![k]! * values[k]! * vectors[j]![k]!;
        expect(sum).toBeCloseTo(S[i]![j]!, 9);
      }
  });
});
