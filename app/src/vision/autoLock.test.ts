import { describe, expect, it } from 'vitest';
import { INSTRUMENTS } from '@core/guitar/instrument';
import {
  AutoLocker,
  anchorAtNut,
  bassUp,
  cutOff,
  endsByOrientation,
  threeCornerCandidates,
  twelfthCandidates,
} from './autoLock';
import { fretX } from '@core/guitar/instrument';
import { shiftFrets } from './lock';
import { apply } from './geometry';
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

describe('twelfthCandidates', () => {
  it('keeps the nut and moves the 12th-fret taps to where fret 12 is if the detection was fret 11 or 13', () => {
    const taps = controlPointsPx(H, model);
    const [same, as11, as13] = twelfthCandidates(taps, model);
    expect(same).toEqual(taps);
    expect(as11![0]).toEqual(taps[0]);
    // Read as fret 11, fret 12 is further from the nut than the detected line: at fretX(13) on H's scale.
    const p = apply(H, fretX(model, 13), 0);
    const mid = { x: (as11![2]!.x + as11![3]!.x) / 2, y: (as11![2]!.y + as11![3]!.y) / 2 };
    expect(Math.hypot(mid.x - p.x, mid.y - p.y)).toBeLessThan(3);
    expect(as13![2]!.x).not.toBeCloseTo(as11![2]!.x, 0);
  });
});

describe('endsByOrientation', () => {
  const p = (x: number, y: number) => ({ x, y });
  const corners = [p(1100, 240), p(1110, 330), p(560, 450), p(550, 350)]; // nut on the right
  it('keeps corners that agree with a confident orientation, or when unsure', () => {
    expect(endsByOrientation({ corners, headstockRight: 0.95 })).toBe(corners);
    expect(endsByOrientation({ corners, headstockRight: 0.5 })).toBe(corners);
  });
  it('swaps the nut and 12th-fret ends when the orientation head disagrees', () => {
    const out = endsByOrientation({ corners, headstockRight: 0.05 });
    expect(out[0]).toEqual(corners[3]);
    expect(out[2]).toEqual(corners[1]);
  });
});

describe('threeCornerCandidates', () => {
  it('rebuilds a hidden 12th-fret corner close to the truth for a gently foreshortened neck', () => {
    const truth = controlPointsPx(H, model);
    const hidden = [truth[0]!, truth[1]!, { x: 0, y: 0 }, truth[3]!];
    const [rebuilt] = threeCornerCandidates(hidden, model);
    expect(Math.hypot(rebuilt![2]!.x - truth[2]!.x, rebuilt![2]!.y - truth[2]!.y)).toBeLessThan(25);
  });
});

describe('anchorAtNut', () => {
  it('undoes a whole-fret slip using the detected nut', () => {
    const det = { corners: controlPointsPx(H, model), cornerScores: [0.9, 0.9, 0.9, 0.9] };
    for (const k of [-3, 1, 7]) {
      const fixed = anchorAtNut(shiftFrets(H, model, k), det, model);
      const p = apply(fixed, fretX(model, 5), 0);
      const q = apply(H, fretX(model, 5), 0);
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(1e-6);
    }
  });
  it('leaves the fit alone when the nut was not seen clearly', () => {
    const det = { corners: controlPointsPx(H, model), cornerScores: [0.1, 0.9, 0.9, 0.9] };
    const slipped = shiftFrets(H, model, 2);
    expect(anchorAtNut(slipped, det, model)).toBe(slipped);
  });
});
