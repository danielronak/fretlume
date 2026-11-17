import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from './oneEuro';

describe('OneEuroFilter', () => {
  it('passes the first sample through and holds a constant signal', () => {
    const f = new OneEuroFilter({ minCutoffHz: 1, beta: 0.01 });
    expect(f.filter(5, 0)).toBe(5);
    for (let i = 1; i < 30; i++) expect(f.filter(5, i * 33)).toBeCloseTo(5, 9);
  });

  it('reduces jitter on a still signal', () => {
    const f = new OneEuroFilter({ minCutoffHz: 1, beta: 0.01 });
    let seed = 7;
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
    let rawSq = 0;
    let outSq = 0;
    for (let i = 0; i < 300; i++) {
      const raw = 100 + noise();
      const out = f.filter(raw, i * 33);
      if (i > 30) {
        rawSq += (raw - 100) ** 2;
        outSq += (out - 100) ** 2;
      }
    }
    expect(Math.sqrt(outSq)).toBeLessThan(0.4 * Math.sqrt(rawSq));
  });

  it('follows fast motion with little lag', () => {
    const f = new OneEuroFilter({ minCutoffHz: 1, beta: 0.05 });
    let out = 0;
    for (let i = 0; i < 60; i++) out = f.filter(i * 10, i * 33); // 300 px/s
    expect(Math.abs(out - 590)).toBeLessThan(15);
  });

  it('resets', () => {
    const f = new OneEuroFilter({ minCutoffHz: 1, beta: 0 });
    f.filter(0, 0);
    f.filter(0, 33);
    f.reset();
    expect(f.filter(42, 66)).toBe(42);
  });

  it('ignores a repeated timestamp', () => {
    const f = new OneEuroFilter({ minCutoffHz: 1, beta: 0 });
    f.filter(1, 0);
    expect(Number.isFinite(f.filter(2, 0))).toBe(true);
  });
});
