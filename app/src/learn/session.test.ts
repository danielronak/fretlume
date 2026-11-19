import { describe, expect, it } from 'vitest';
import { createSession, progress, reduce, remainingMs, stepDurationMs, type Step } from './session';

const steps: Step<string>[] = [
  { id: 'a', show: 'A', advance: { auto: 'timer', seconds: 4 } },
  { id: 'b', show: 'B', advance: { auto: 'bars', n: 2 }, repeats: 2 },
  { id: 'c', show: 'C', advance: 'manual' },
];

describe('session engine', () => {
  it('step durations: seconds, bars at the tempo, manual has none', () => {
    const s = createSession(steps, { bpm: 120, beatsPerBar: 4 });
    expect(stepDurationMs(s, 0)).toBe(4000);
    expect(stepDurationMs(s, 1)).toBe(4000); // 2 bars × 4 beats × 500 ms
    expect(stepDurationMs(s, 2)).toBeNull();
  });

  it('auto-advances on ticks, honours repeats, stops at a manual step', () => {
    let s = createSession(steps, { bpm: 120, beatsPerBar: 4 });
    s = reduce(s, { type: 'start', tMs: 0 });
    expect(s.playing).toBe(true);
    s = reduce(s, { type: 'tick', tMs: 3999 });
    expect(s.index).toBe(0);
    s = reduce(s, { type: 'tick', tMs: 4000 });
    expect([s.index, s.repeat]).toEqual([1, 0]);
    s = reduce(s, { type: 'tick', tMs: 8000 });
    expect([s.index, s.repeat]).toEqual([1, 1]);
    s = reduce(s, { type: 'tick', tMs: 12000 });
    expect([s.index, s.repeat]).toEqual([2, 0]);
    s = reduce(s, { type: 'tick', tMs: 60000 });
    expect(s.index).toBe(2); // manual: waits for Next
    s = reduce(s, { type: 'next', tMs: 60000 });
    expect(s.finished).toBe(true);
    expect(s.playing).toBe(false);
  });

  it('a late tick skips no step (one advance per tick, carrying the overshoot)', () => {
    let s = createSession(steps, { bpm: 120, beatsPerBar: 4 });
    s = reduce(s, { type: 'start', tMs: 0 });
    s = reduce(s, { type: 'tick', tMs: 4500 });
    expect(s.index).toBe(1);
    expect(remainingMs(s, 4500)).toBe(3500);
  });

  it('pause freezes the clock; resume continues where it was', () => {
    let s = createSession(steps, { bpm: 120, beatsPerBar: 4 });
    s = reduce(s, { type: 'start', tMs: 0 });
    s = reduce(s, { type: 'pause', tMs: 1000 });
    s = reduce(s, { type: 'tick', tMs: 10_000 });
    expect(s.index).toBe(0);
    expect(remainingMs(s, 10_000)).toBe(3000);
    s = reduce(s, { type: 'start', tMs: 10_000 });
    s = reduce(s, { type: 'tick', tMs: 12_999 });
    expect(s.index).toBe(0);
    s = reduce(s, { type: 'tick', tMs: 13_000 });
    expect(s.index).toBe(1);
  });

  it('loop wraps from the last step to the first; back and next wrap too', () => {
    let s = createSession(steps, { loop: true });
    s = reduce(s, { type: 'goto', index: 2, tMs: 0 });
    s = reduce(s, { type: 'next', tMs: 0 });
    expect([s.index, s.finished]).toEqual([0, false]);
    s = reduce(s, { type: 'back', tMs: 0 });
    expect(s.index).toBe(2);
    s = reduce(s, { type: 'setLoop', loop: false, tMs: 0 });
    s = reduce(s, { type: 'goto', index: 0, tMs: 0 });
    s = reduce(s, { type: 'back', tMs: 0 });
    expect(s.index).toBe(0);
  });

  it('restart goes back to the first step, first repeat, keeps playing state', () => {
    let s = createSession(steps, { bpm: 120, beatsPerBar: 4 });
    s = reduce(s, { type: 'start', tMs: 0 });
    s = reduce(s, { type: 'tick', tMs: 8000 });
    s = reduce(s, { type: 'restart', tMs: 9000 });
    expect([s.index, s.repeat, s.playing, s.finished]).toEqual([0, 0, true, false]);
    expect(remainingMs(s, 9000)).toBe(4000);
  });

  it('progress counts finished repeats over all repeats', () => {
    let s = createSession(steps, { bpm: 120, beatsPerBar: 4 });
    expect(progress(s)).toEqual({ done: 0, total: 4 });
    s = reduce(s, { type: 'start', tMs: 0 });
    s = reduce(s, { type: 'tick', tMs: 4000 });
    s = reduce(s, { type: 'tick', tMs: 8000 });
    expect(progress(s)).toEqual({ done: 2, total: 4 });
  });

  it('a session with no steps is finished and ignores actions', () => {
    let s = createSession([] as Step<string>[]);
    expect(s.finished).toBe(true);
    s = reduce(s, { type: 'start', tMs: 0 });
    expect(s.playing).toBe(false);
  });

  it('tempo changes rescale bar-timed steps', () => {
    let s = createSession(steps, { bpm: 120, beatsPerBar: 4 });
    s = reduce(s, { type: 'setTempo', bpm: 60, tMs: 0 });
    expect(stepDurationMs(s, 1)).toBe(8000);
  });

  it('new steps keep the position and the clock', () => {
    let s = createSession(steps, { bpm: 120, beatsPerBar: 4 });
    s = reduce(s, { type: 'start', tMs: 0 });
    s = reduce(s, { type: 'goto', index: 1, tMs: 100 });
    const timed = steps.map((x) => ({ ...x, advance: { auto: 'timer' as const, seconds: 1 } }));
    s = reduce(s, { type: 'setSteps', steps: timed, tMs: 200 });
    expect([s.index, s.playing]).toEqual([1, true]);
    s = reduce(s, { type: 'tick', tMs: 1100 });
    expect([s.index, s.repeat]).toEqual([1, 1]);
  });
});
