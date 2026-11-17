import { describe, expect, it } from 'vitest';
import { INSTRUMENTS } from '@core/guitar/instrument';
import { AutoLocker, bassUp, cutOff } from './autoLock';
import { luma } from './autoLockStats';
import type { EdgeTracker, RefineResult } from './edgeTracker';
import { controlPointsPx, fromControlPoints, type Mat3 } from './geometry';
import type { Image } from './image';
import { fullScore } from './lock';
import type { NeckDetection } from './neckNet';

const model = INSTRUMENTS.electric;
const H: Mat3 = fromControlPoints(
  [
    { x: 1100, y: 240 },
    { x: 1112, y: 330 },
    { x: 560, y: 450 },
    { x: 548, y: 352 },
  ],
  model,
);
const frame = (v: number): Image => ({
  width: 1280,
  height: 720,
  channels: 1,
  data: new Uint8Array(1280 * 720).fill(v),
});

function detection(presence: number): NeckDetection {
  return {
    presence,
    corners: controlPointsPx(H, model),
    cornerScores: [0.9, 0.9, 0.9, 0.9],
    headstockRight: 0.9,
    profile: { id: 'electric', p: [0, 1, 0] },
    mask: new Float32Array(0),
  };
}

/** A tracker that always finds H with the given confidence. */
function tracker(confidence: number): EdgeTracker {
  return {
    model,
    refine: (): RefineResult => ({
      H,
      inliers: confidence > 0 ? 100 : 0,
      score: confidence * fullScore(model),
      samples: 1,
    }),
  } as unknown as EdgeTracker;
}

describe('AutoLocker', () => {
  it('asks for light in a dark scene and finds nothing without a neck', () => {
    const a = new AutoLocker(tracker(0.9), () => detection(0.1));
    expect(a.update(frame(10), 0).hint).toBe('too-dark');
    expect(a.update(frame(120), 300).hint).toBe('no-neck');
    expect(a.current.state).toBe('searching');
  });

  it('detects at most four times a second', () => {
    let calls = 0;
    const a = new AutoLocker(tracker(0.9), () => (calls++, detection(0.1)));
    for (let t = 0; t < 1000; t += 33) a.update(frame(120), t);
    expect(calls).toBe(4);
  });

  it('verifies over five frames, then locks', () => {
    const a = new AutoLocker(tracker(0.9), () => detection(0.95));
    // The index check samples a blank frame: every shift scores alike, so it keeps the fit.
    expect(a.update(frame(120), 0).state).toBe('verifying');
    const states = [1, 2, 3, 4, 5].map((k) => a.update(frame(120), k * 33).state);
    expect(states).toEqual(['verifying', 'verifying', 'verifying', 'verifying', 'locked']);
    expect(a.current.H).not.toBeNull();
  });

  it('never locks on a weak fit', () => {
    const a = new AutoLocker(tracker(0.2), () => detection(0.95));
    for (let t = 0; t < 3000; t += 33) a.update(frame(120), t);
    expect(a.current.state).toBe('searching');
    expect(a.current.hint).toBe('lift-hand');
  });

  it('names the edge a neck is cut off at', () => {
    expect(cutOff([{ x: -100, y: 10 }], 1280, 720)).toBe('cut-off-left');
    expect(cutOff([{ x: 600, y: 800 }], 1280, 720)).toBe('cut-off-bottom');
    expect(cutOff([{ x: 600, y: 300 }], 1280, 720)).toBeNull();
    expect(luma(frame(77))).toBe(77);
  });
});

describe('bassUp', () => {
  it('puts the upper corner first at the nut and last at the 12th fret', () => {
    const p = (x: number, y: number) => ({ x, y });
    expect(bassUp([p(0, 50), p(0, 10), p(9, 60), p(9, 20)])).toEqual([
      p(0, 10),
      p(0, 50),
      p(9, 60),
      p(9, 20),
    ]);
    expect(bassUp([p(0, 10), p(0, 50), p(9, 20), p(9, 60)])).toEqual([
      p(0, 10),
      p(0, 50),
      p(9, 60),
      p(9, 20),
    ]);
  });
});
