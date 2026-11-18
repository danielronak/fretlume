import { describe, expect, it } from 'vitest';
import { INSTRUMENTS } from '@core/guitar/instrument';
import type { EdgeTracker, RefineOptions, RefineResult } from './edgeTracker';
import { controlPointsPx, fromControlPoints, type Mat3, type Pt } from './geometry';
import type { Image } from './image';
import { fullScore } from './lock';
import { slipped, TrackingSession, warped } from './tracking';
import { shiftFrets } from './lock';

const model = INSTRUMENTS.electric;
const at = (dx: number): Mat3 =>
  fromControlPoints(
    [
      { x: 1100 + dx, y: 240 },
      { x: 1112 + dx, y: 330 },
      { x: 560 + dx, y: 450 },
      { x: 548 + dx, y: 352 },
    ],
    model,
  );
const image: Image = { width: 1, height: 1, channels: 1, data: new Uint8ClampedArray(1) };

/** A tracker that reports the neck at `truth` (or fails), and records where it was started. */
function stub() {
  const calls: { start: Mat3; options: RefineOptions }[] = [];
  let truth: Mat3 | null = at(0);
  const tracker = {
    model,
    refine(_image: Image, H0: Mat3, options: RefineOptions): RefineResult {
      calls.push({ start: H0, options });
      return truth
        ? { H: truth, inliers: 100, score: 0.8 * fullScore(model), samples: 1000 }
        : { H: H0, inliers: 0, score: 0, samples: 1000 };
    },
  } as unknown as EdgeTracker;
  return { tracker, calls, set: (H: Mat3 | null) => (truth = H) };
}

describe('TrackingSession', () => {
  it('publishes nothing before a lock', () => {
    expect(new TrackingSession(stub().tracker).update(image, 0)).toBeNull();
  });

  it('follows the measurement and reports confidence', () => {
    const s = stub();
    const session = new TrackingSession(s.tracker);
    session.lock(at(0), 'dark', 0);
    s.set(at(5));
    const pose = session.update(image, 33)!;
    expect(pose.state).toBe('locked');
    expect(pose.measured).toBe(true);
    expect(pose.confidence).toBeCloseTo(0.8, 6);
    expect(s.calls[0]!.options).toMatchObject({ wide: false, polarity: 'dark' });
    // Filtered: between the old and the new position.
    expect(pose.controlPoints[0]!.x).toBeGreaterThan(1100);
    expect(pose.controlPoints[0]!.x).toBeLessThanOrEqual(1105);
  });

  it('predicts with constant velocity', () => {
    const s = stub();
    const session = new TrackingSession(s.tracker);
    session.lock(at(0), 'bright', 0);
    s.set(at(10));
    session.update(image, 33);
    s.set(at(20));
    session.update(image, 66);
    const start = controlPointsPx(s.calls[1]!.start, model)[0]!;
    // Started ahead of the last measurement (1110), towards 1120.
    expect(start.x).toBeGreaterThan(1112);
  });

  it('holds, recovers, then asks for a new lock; comes back on success', () => {
    const s = stub();
    const session = new TrackingSession(s.tracker);
    session.lock(at(0), 'bright', 0);
    s.set(null);
    expect(session.update(image, 100)!.state).toBe('locked');
    expect(session.update(image, 100)!.measured).toBe(false);
    expect(session.update(image, 400)!.state).toBe('recovering');
    expect(s.calls.at(-1)!.options.wide).toBe(true);
    expect(session.update(image, 2000)!.state).toBe('searching');
    s.set(at(3));
    const pose = session.update(image, 2033)!;
    expect(pose.state).toBe('locked');
    expect(pose.controlPoints[0]!.x).toBeCloseTo(1103, 6); // filters restart after a gap
  });

  it('survives a tracker exception', () => {
    const tracker = {
      model,
      refine: () => {
        throw new Error('singular homography');
      },
    } as unknown as EdgeTracker;
    const session = new TrackingSession(tracker);
    session.lock(at(0), 'bright', 0);
    expect(session.update(image, 33)!.measured).toBe(false);
  });

  it('reset stops tracking', () => {
    const session = new TrackingSession(stub().tracker);
    session.lock(at(0), 'bright', 0);
    session.reset();
    expect(session.currentState).toBe('searching');
    expect(session.update(image, 33)).toBeNull();
  });
});

describe('TrackingSession.rescale', () => {
  it('carries the pose to a new frame size', () => {
    const s = stub();
    const session = new TrackingSession(s.tracker);
    session.lock(at(0), 'bright', 0);
    session.rescale(0.5);
    s.set(null);
    const pose = session.update(image, 33)!;
    expect(pose.controlPoints[0]!.x).toBeCloseTo(550, 6);
    expect(session.wirePolarity).toBe('bright');
  });
});

describe('slipped', () => {
  it('flags a nut that moved a whole fret along the neck, not a small move', () => {
    const H = at(0);
    expect(slipped(H, H, model)).toBe(false);
    expect(slipped(H, at(5), model)).toBe(false);
    // One fret toward the body: the measured nut sits where fret 1 was.
    expect(slipped(H, shiftFrets(H, model, 1), model)).toBe(true);
    expect(slipped(H, shiftFrets(H, model, -1), model)).toBe(true);
  });
});

describe('warped (plausibility guard)', () => {
  const pts = controlPointsPx(at(0), model);
  const lockShape = (() => {
    const [a, b, c, d] = pts as [Pt, Pt, Pt, Pt];
    const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);
    const length = (dist(a, d) + dist(b, c)) / 2;
    return { nut: dist(a, b) / length, twelfth: dist(c, d) / length, length };
  })();
  it('accepts a small move and a whole-board scale change', () => {
    expect(warped(lockShape, pts, controlPointsPx(at(8), model))).toBe(false);
    const scaled = pts.map((p) => ({ x: 800 + 1.05 * (p.x - 800), y: 300 + 1.05 * (p.y - 300) }));
    expect(warped(lockShape, scaled, scaled)).toBe(false);
  });
  it('refuses a jump of more than a nut width', () => {
    expect(warped(lockShape, pts, controlPointsPx(at(150), model))).toBe(true);
  });
  it('refuses a fit that stretches along the neck faster than the guitar can move', () => {
    const [a, b, c, d] = pts as [Pt, Pt, Pt, Pt];
    const pull = (p: Pt) => ({ x: p.x + 0.15 * (p.x - c.x), y: p.y + 0.15 * (p.y - c.y) });
    expect(warped(lockShape, pts, [pull(a), pull(b), c, d], 133)).toBe(true);
    // The same change spread over half a second is a real move.
    expect(warped(lockShape, pts, [pull(a), pull(b), c, d], 500)).toBe(false);
  });
  it('refuses a fit that squashes the 12th fret', () => {
    const [a, b, c, d] = pts as [Pt, Pt, Pt, Pt];
    const mid = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
    const squash = (p: Pt) => ({ x: mid.x + 0.5 * (p.x - mid.x), y: mid.y + 0.5 * (p.y - mid.y) });
    expect(warped(lockShape, pts, [a, b, squash(c), squash(d)])).toBe(true);
  });
});
