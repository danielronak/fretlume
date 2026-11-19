import { describe, expect, it } from 'vitest';
import {
  beatIndexAt,
  barStarts,
  barTicks,
  newTab,
  noteMidi,
  planVoices,
  secondsPerTick,
  timeline,
  TPQ,
  validateTab,
  type Tab,
  type TabNote,
} from './model';

function tabOf(beats: TabNote[][], durTicks = TPQ): Tab {
  const tab = newTab('t', 'Test', 1);
  tab.tempoBpm = 120; // a quarter = 0.5 s
  tab.tracks[0]!.bars = [{ beats: beats.map((notes) => ({ durTicks, notes })) }];
  return tab;
}

describe('tab model', () => {
  it('bar length, tempo and pitch', () => {
    const tab = newTab('t', 'T');
    expect(barTicks(tab)).toBe(4 * TPQ);
    expect(barTicks({ timeSig: [6, 8] })).toBe(3 * TPQ);
    expect(secondsPerTick({ tempoBpm: 120 }) * TPQ).toBeCloseTo(0.5, 9);
    expect(secondsPerTick({ tempoBpm: 120 }, 50) * TPQ).toBeCloseTo(1, 9);
    expect(noteMidi(tab, { string: 6, fret: 3 })).toBe(43);
    expect(noteMidi({ ...tab, capo: 2 }, { string: 1, fret: 0 })).toBe(66);
    expect(() => noteMidi(tab, { string: 7, fret: 0 })).toThrow();
  });

  it('timeline and bar starts', () => {
    const tab = newTab('t', 'T', 2);
    tab.tracks[0]!.bars[1]!.chordSymbol = 'G';
    const tl = timeline(tab);
    expect(tl).toHaveLength(8);
    expect(tl[4]).toMatchObject({ bar: 1, beat: 0, tick: 4 * TPQ, rest: true, chordSymbol: 'G' });
    expect(barStarts(tab)).toEqual([0, 4 * TPQ, 8 * TPQ]);
  });

  it('plain notes pluck and ring until the next note on their string', () => {
    const v = planVoices(
      tabOf([[{ string: 3, fret: 2 }], [{ string: 3, fret: 4 }], [{ string: 2, fret: 1 }]]),
    );
    expect(v.map((x) => x.kind)).toEqual(['pluck', 'pluck', 'pluck']);
    expect(v[0]!.start).toBe(0);
    expect(v[0]!.end).toBeCloseTo(0.5, 9); // cut by the next note on string 3
    expect(v[1]!.end).toBeGreaterThan(1.0); // rings on (string 2 does not stop it)
  });

  it('hammer-on and pull-off do not re-pluck', () => {
    const v = planVoices(
      tabOf([
        [{ string: 3, fret: 2 }],
        [{ string: 3, fret: 4, tech: 'h' }],
        [{ string: 3, fret: 2, tech: 'p' }],
      ]),
    );
    expect(v.map((x) => x.kind)).toEqual(['pluck', 'legato', 'legato']);
    expect(v[1]!.gain).toBeLessThan(v[0]!.gain);
  });

  it('a slide glides the previous voice to the new fret instead of plucking', () => {
    const v = planVoices(tabOf([[{ string: 3, fret: 4 }], [{ string: 3, fret: 6, tech: '/' }]]));
    expect(v[1]).toMatchObject({ kind: 'legato', gain: 0, glideFrom: 0 });
    expect(v[0]!.pitch).toEqual([
      [0.5, 0],
      [0.62, 2],
    ]);
    expect(v[0]!.end).toBeGreaterThan(1); // keeps ringing through the slid-to note
  });

  it('a slide with nothing to slide from just plucks', () => {
    expect(planVoices(tabOf([[{ string: 3, fret: 6, tech: '/' }]]))[0]!.kind).toBe('pluck');
  });

  it('bend, release, vibrato, mute and palm mute', () => {
    const v = planVoices(
      tabOf([
        [{ string: 2, fret: 8, tech: 'b', bendSemis: 2 }],
        [{ string: 2, fret: 8, tech: 'r', bendSemis: 2 }],
        [{ string: 1, fret: 5, tech: '~' }],
        [{ string: 6, fret: 0, tech: 'x' }],
        [{ string: 5, fret: 3, tech: 'pm' }],
      ]),
    );
    expect(v[0]!.pitch).toEqual([
      [0, 0],
      [0.25, 2],
    ]);
    expect(v[1]).toMatchObject({
      kind: 'legato',
      pitch: [
        [0, 2],
        [0.25, 0],
      ],
    });
    expect(v[2]!.pitch!.length).toBeGreaterThan(3);
    expect(v[3]).toMatchObject({ kind: 'noise' });
    expect(v[3]!.end - v[3]!.start).toBeLessThan(0.05);
    expect(v[4]!.damped).toBe(true);
    expect(v[4]!.end - v[4]!.start).toBeLessThan(0.25);
  });

  it('a loop window plays only its beats, from zero, at the tempo percentage', () => {
    const tab = tabOf([
      [{ string: 1, fret: 0 }],
      [{ string: 1, fret: 1 }],
      [{ string: 1, fret: 2 }],
      [{ string: 1, fret: 3 }],
    ]);
    const v = planVoices(tab, { fromTick: TPQ, toTick: 3 * TPQ, tempoPct: 50 });
    expect(v.map((x) => x.fret)).toEqual([1, 2]);
    expect(v[1]!.start).toBeCloseTo(1, 9);
  });

  it('validation names the problems', () => {
    expect(validateTab(newTab('t', 'T'))).toEqual([]);
    const bad = tabOf([[{ string: 7, fret: 30 }]], 0);
    bad.tempoBpm = 5;
    bad.timeSig = [4, 3];
    const problems = validateTab(bad);
    expect(problems.join(' | ')).toMatch(/tempo/);
    expect(problems.join(' | ')).toMatch(/time signature/);
    expect(problems.join(' | ')).toMatch(/string 7/);
    expect(problems.join(' | ')).toMatch(/fret 30/);
    expect(problems.join(' | ')).toMatch(/no length/);
    expect(validateTab({ ...newTab('t', 'T'), tuning: [1, 2], capo: 20 }).length).toBe(2);
  });

  it('beatIndexAt finds the sounding beat', () => {
    const beats = [{ tick: 0 }, { tick: 480 }, { tick: 720 }];
    expect([-1, 0, 479, 480, 719, 720, 99999].map((t) => beatIndexAt(beats, t))).toEqual([
      -1, 0, 0, 1, 1, 2, 2,
    ]);
    expect(beatIndexAt([], 0)).toBe(-1);
  });
});
