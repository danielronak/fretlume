import { describe, expect, it } from 'vitest';
import { compare, TrackingWatchdog } from './watchdog';

// Headstock on the right: nut at x ≈ 1000, 12th fret at x ≈ 500; bass corners on top.
const tracked = [
  { x: 1000, y: 300 },
  { x: 1000, y: 360 },
  { x: 500, y: 370 },
  { x: 500, y: 290 },
];
const det = (dx: number, presence = 0.95, scores = [0.8, 0.8, 0.7, 0.7]) => ({
  presence,
  corners: tracked.map((p, i) => ({ x: p.x + (i < 2 ? dx : 0), y: p.y })),
  cornerScores: scores,
  headstockRight: 0.95,
});

describe('watchdog compare', () => {
  it('agrees when NeckNet sees the neck where the grid is', () => {
    expect(compare(det(10), tracked)).toBe('agree');
  });
  it('disagrees when the nut is more than ¾ of a nut width away', () => {
    expect(compare(det(60), tracked)).toBe('disagree');
  });
  it('disagrees when no neck is in view', () => {
    expect(compare(det(0, 0.05), tracked)).toBe('disagree');
  });
  it('is unsure when the detection is weak', () => {
    expect(compare(det(200, 0.4), tracked)).toBe('unsure');
    expect(compare(det(200, 0.95, [0.1, 0.1, 0.1, 0.1]), tracked)).toBe('unsure');
  });
  it('reads corners in either order (bass up, headstock side)', () => {
    const d = det(0);
    expect(
      compare(
        { ...d, corners: [d.corners[1]!, d.corners[0]!, d.corners[3]!, d.corners[2]!] },
        tracked,
      ),
    ).toBe('agree');
  });
});

describe('TrackingWatchdog', () => {
  it('checks once a second and needs two disagreements in a row', () => {
    const w = new TrackingWatchdog();
    w.reset(0);
    expect(w.due(500)).toBe(false);
    expect(w.due(1000)).toBe(true);
    expect(w.record('disagree', 1000)).toBe(false);
    expect(w.record('agree', 2000)).toBe(false);
    expect(w.record('disagree', 3000)).toBe(false);
    expect(w.record('unsure', 4000)).toBe(false);
    expect(w.record('disagree', 5000)).toBe(true);
  });
});
