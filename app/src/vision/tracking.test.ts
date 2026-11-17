import { describe, expect, it } from 'vitest';
import { INSTRUMENTS } from '@core/guitar/instrument';
import type { EdgeTracker, RefineOptions, RefineResult } from './edgeTracker';
import { controlPointsPx, fromControlPoints, type Mat3 } from './geometry';
import type { Image } from './image';
import { fullScore } from './lock';
import { TrackingSession } from './tracking';

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
