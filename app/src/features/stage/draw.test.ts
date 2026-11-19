import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MIN_DOT_RADIUS, screenAxes, toCanvas, toVideo } from './draw';

describe('Stage view mapping', () => {
  it('toVideo inverts toCanvas, mirrored or not', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.double({ min: 0.2, max: 3, noNaN: true }),
        fc.double({ min: 0, max: 1280, noNaN: true }),
        fc.double({ min: 0, max: 720, noNaN: true }),
        (mirror, scale, x, y) => {
          const view = { mirror, scale, videoWidth: 1280 };
          const back = toVideo(view, toCanvas(view, { x, y }));
          expect(back.x).toBeCloseTo(x, 6);
          expect(back.y).toBeCloseTo(y, 6);
        },
      ),
    );
  });

  it('mirrors horizontally', () => {
    expect(toCanvas({ mirror: true, scale: 0.5, videoWidth: 1280 }, { x: 1180, y: 100 })).toEqual({
      x: 50,
      y: 50,
    });
  });
});

describe('screenAxes', () => {
  it('keeps big dots and enlarges tiny ones, keeping their shape', () => {
    const view = { mirror: false, scale: 1, videoWidth: 1280 };
    expect(screenAxes(view, { rx: 12, ry: 9 })).toEqual([12, 9]);
    const [rx, ry] = screenAxes(view, { rx: 4, ry: 2 });
    expect(Math.sqrt(rx * ry)).toBeCloseTo(MIN_DOT_RADIUS, 6);
    expect(rx / ry).toBeCloseTo(2, 6);
  });
  it('scales the smallest size with the dot size setting (field test 2026-11-19)', () => {
    const view = { mirror: false, scale: 1, videoWidth: 1280 };
    const small = screenAxes(view, { rx: 2, ry: 2 }, MIN_DOT_RADIUS * 0.4);
    const big = screenAxes(view, { rx: 2, ry: 2 }, MIN_DOT_RADIUS * 2);
    expect(big[0] / small[0]).toBeCloseTo(5, 6);
  });
});
