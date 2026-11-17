import { describe, expect, it } from 'vitest';
import { TierController } from './tiers';

describe('TierController', () => {
  it('drops when slow, climbs back when fast, and waits between changes', () => {
    const t = new TierController(28, 10);
    expect(t.scale).toBe(1);
    let changed = false;
    for (let i = 0; i < 10; i++) changed = t.report(50);
    expect(changed).toBe(true);
    expect(t.scale).toBe(0.75);
    for (let i = 0; i < 9; i++) expect(t.report(50)).toBe(false);
    t.report(50);
    expect(t.scale).toBe(0.5);
    for (let i = 0; i < 30; i++) t.report(50);
    expect(t.scale).toBe(0.5); // lowest tier
    let steps = 0;
    while (!t.report(4)) steps++;
    expect(t.scale).toBe(0.75);
    expect(steps).toBeLessThan(30);
  });

  it('stays put inside the budget', () => {
    const t = new TierController(28, 10);
    for (let i = 0; i < 100; i++) expect(t.report(15)).toBe(false);
    expect(t.tier).toBe(0);
  });
});
