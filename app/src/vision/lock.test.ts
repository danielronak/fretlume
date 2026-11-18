import { describe, expect, it } from 'vitest';
import { INSTRUMENTS } from '@core/guitar/instrument';
import { apply, fromControlPoints, type Mat3 } from './geometry';
import { homographyFromTaps, shiftFrets, tapPointsMm, tapsInFrame } from './lock';
import { fretX } from '@core/guitar/instrument';

const model = INSTRUMENTS.steelAcoustic;
const H: Mat3 = fromControlPoints(
  [
    { x: 1100, y: 240 },
    { x: 1112, y: 330 },
    { x: 560, y: 450 },
    { x: 548, y: 352 },
  ],
  model,
);

describe('lock taps', () => {
  it('4 and 6 exact taps give back the homography', () => {
    for (const count of [4, 6] as const) {
      const taps = tapPointsMm(model, count).map((p) => apply(H, p.x, p.y));
      const fitted = homographyFromTaps(taps, model);
      for (const q of [
        { x: 0, y: 0 },
        { x: 400, y: 20 },
      ]) {
        const a = apply(fitted, q.x, q.y);
        const b = apply(H, q.x, q.y);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);
      }
    }
  });

  it('the first four tap points are the control points', () => {
    const four = tapPointsMm(model, 4);
    expect(tapPointsMm(model, 6).slice(0, 4)).toEqual(four);
    expect(four[0]!.x).toBe(0);
    expect(four[0]!.y).toBeLessThan(0);
  });

  it('rejects other tap counts', () => {
    expect(() => homographyFromTaps([], model)).toThrow();
  });
});

describe('shiftFrets', () => {
  it('moves every fret line onto its neighbour and back', () => {
    for (const k of [1, -1, 2]) {
      const shifted = shiftFrets(H, model, k);
      for (let n = 2; n <= 12; n++) {
        const a = apply(shifted, fretX(model, n), 5);
        const b = apply(H, fretX(model, n + k), 5);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);
      }
      const back = shiftFrets(shifted, model, -k);
      const p = apply(back, 100, 3);
      const q = apply(H, 100, 3);
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(1e-6);
    }
  });
});

describe('tapsInFrame', () => {
  it('accepts taps on screen (with a small margin) and refuses lost poses', () => {
    expect(
      tapsInFrame(
        [
          { x: 10, y: 10 },
          { x: 1300, y: 700 },
        ],
        1280,
        720,
      ),
    ).toBe(true);
    expect(tapsInFrame([{ x: -2774, y: 1086 }], 1280, 720)).toBe(false);
    expect(tapsInFrame([{ x: Number.NaN, y: 1 }], 1280, 720)).toBe(false);
  });
});
