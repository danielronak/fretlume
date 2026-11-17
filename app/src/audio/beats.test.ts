import { describe, expect, it } from 'vitest';
import { clampBpm, clicksUntil, describeClick, groupSize, tapTempo, type MeterSpec } from './beats';

const fourFour: MeterSpec = {
  bpm: 120,
  beatsPerBar: 4,
  beatUnit: 4,
  subdivision: 1,
  accentFirst: true,
  countInBars: 0,
};

describe('metronome clicks', () => {
  it('spaces quarter notes at 120 bpm half a second apart, accenting the bar', () => {
    const clicks = clicksUntil(fourFour, 10, 0, 12.01);
    expect(clicks.map((c) => c.time)).toEqual([10, 10.5, 11, 11.5, 12]);
    expect(clicks.map((c) => c.kind)).toEqual(['bar', 'beat', 'beat', 'beat', 'bar']);
    expect(clicks[4]).toMatchObject({ bar: 1, beat: 0 });
  });

  it('continues from where the last window stopped, without gaps or repeats', () => {
    const meter = { ...fourFour, subdivision: 3 as const };
    const a = clicksUntil(meter, 0, 0, 0.73);
    const b = clicksUntil(meter, 0, a.length, 1.4);
    const all = [...a, ...b].map((c) => c.index);
    expect(all).toEqual(all.map((_, i) => i));
    expect(b[0]!.time).toBeCloseTo(a.length / 6, 9);
  });

  it('marks subdivisions and compound groups', () => {
    const eighths = { ...fourFour, subdivision: 2 as const };
    expect([0, 1, 2, 3].map((i) => describeClick(i, eighths).kind)).toEqual([
      'bar',
      'sub',
      'beat',
      'sub',
    ]);
    const sixEight: MeterSpec = { ...fourFour, beatsPerBar: 6, beatUnit: 8 };
    expect(groupSize(sixEight)).toBe(3);
    expect([0, 1, 2, 3, 4, 5].map((i) => describeClick(i, sixEight).kind)).toEqual([
      'bar',
      'beat',
      'beat',
      'group',
      'beat',
      'beat',
    ]);
    expect(groupSize({ beatsPerBar: 3, beatUnit: 8 })).toBe(1);
    expect(describeClick(0, { ...fourFour, accentFirst: false }).kind).toBe('beat');
  });

  it('flags count-in bars', () => {
    const meter = { ...fourFour, countInBars: 1 };
    expect(describeClick(3, meter).countIn).toBe(true);
    expect(describeClick(4, meter).countIn).toBe(false);
  });
});

describe('tap tempo', () => {
  it('uses the median gap of recent taps', () => {
    expect(tapTempo([0])).toBeNull();
    expect(tapTempo([0, 500, 1000, 1500])).toBe(120);
    expect(tapTempo([0, 500, 1010, 1500, 2000])).toBe(120);
  });

  it('starts over after a pause and clamps the range', () => {
    expect(tapTempo([0, 500, 5000, 5400])).toBe(150);
    expect(tapTempo([0, 100])).toBe(260);
    expect(tapTempo([0, 1900])).toBe(32);
    expect(clampBpm(10)).toBe(30);
  });
});
