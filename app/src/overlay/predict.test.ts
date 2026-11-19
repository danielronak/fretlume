import { describe, expect, it } from 'vitest';
import { PosePredictor } from './predict';

const quad = (dx: number) => [
  { x: 1000 + dx, y: 300 },
  { x: 1000 + dx, y: 360 },
  { x: 500 + dx, y: 370 },
  { x: 500 + dx, y: 290 },
];

describe('PosePredictor', () => {
  it('returns the last pose while nothing moves', () => {
    const p = new PosePredictor();
    p.push(quad(0), 0, true);
    p.push(quad(0), 100, true);
    expect(p.at(180)).toEqual(quad(0));
  });

  it('extrapolates a steady move to the shown frame time', () => {
    const p = new PosePredictor();
    p.push(quad(0), 0, true);
    p.push(quad(20), 100, true); // 0.2 px/ms
    const q = p.at(150)!;
    expect(q[0]!.x).toBeCloseTo(1030, 6);
    expect(q[2]!.x).toBeCloseTo(530, 6);
  });

  it('says which moment the drawn grid describes', () => {
    const p = new PosePredictor({ maxAheadMs: 100 });
    p.push(quad(0), 0, true);
    expect(p.describes(50)).toBe(0);
    p.push(quad(20), 100, true);
    expect(p.describes(150)).toBe(150);
    expect(p.describes(1000)).toBe(200);
  });

  it('never looks further ahead than maxAheadMs', () => {
    const p = new PosePredictor({ maxAheadMs: 100 });
    p.push(quad(0), 0, true);
    p.push(quad(20), 100, true);
    expect(p.at(1000)![0]!.x).toBeCloseTo(1040, 6);
  });

  it('holds still while the tracker holds or recovers, and after a gap', () => {
    const p = new PosePredictor();
    p.push(quad(0), 0, true);
    p.push(quad(20), 100, true);
    p.push(quad(20), 200, false);
    expect(p.at(300)).toEqual(quad(20));
    p.push(quad(40), 900, true); // 700 ms after the last pose: no velocity from that
    expect(p.at(1000)).toEqual(quad(40));
  });

  it('forgets the motion on reset', () => {
    const p = new PosePredictor();
    p.push(quad(0), 0, true);
    p.push(quad(20), 100, true);
    p.reset();
    expect(p.at(150)).toBeNull();
  });
});
