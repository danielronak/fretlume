import { describe, expect, it } from 'vitest';
import { levelVerdict, METER_START, meterStep, rmsOf, SILENCE_DB, toDb } from './level';

describe('level maths', () => {
  it('converts to dBFS', () => {
    expect(toDb(1)).toBe(0);
    expect(toDb(0.5)).toBeCloseTo(-6.02, 2);
    expect(toDb(0)).toBe(SILENCE_DB);
  });

  it('computes RMS of a sine as amplitude / √2', () => {
    const sine = Float32Array.from(
      { length: 4800 },
      (_, i) => 0.5 * Math.sin((2 * Math.PI * 110 * i) / 48000),
    );
    expect(rmsOf(sine)).toBeCloseTo(0.5 / Math.SQRT2, 3);
    expect(rmsOf([])).toBe(0);
  });

  it('rises instantly and falls slowly', () => {
    const up = meterStep(METER_START, { rmsDb: -12, peakDb: -6 }, 33);
    expect(up.levelDb).toBe(-12);
    const down = meterStep(up, { rmsDb: -80, peakDb: -80 }, 500, { releaseDbPerS: 24 });
    expect(down.levelDb).toBeCloseTo(-24, 6);
  });

  it('holds the peak, then lets it fall', () => {
    let state = meterStep(METER_START, { rmsDb: -20, peakDb: -3 }, 33);
    state = meterStep(state, { rmsDb: -40, peakDb: -40 }, 1000, { holdMs: 1500 });
    expect(state.peakDb).toBe(-3);
    state = meterStep(state, { rmsDb: -40, peakDb: -40 }, 1000, {
      holdMs: 1500,
      releaseDbPerS: 24,
    });
    expect(state.peakDb).toBeCloseTo(-27, 6);
  });

  it('gives a plain verdict', () => {
    expect(levelVerdict(-70, -60)).toBe('silent');
    expect(levelVerdict(-50, -40)).toBe('quiet');
    expect(levelVerdict(-20, -8)).toBe('good');
    expect(levelVerdict(-6, -0.5)).toBe('loud');
  });
});
