import { describe, expect, it } from 'vitest';
import { fromAscii, noteToken, parseToken, TabParseError, toAscii } from './ascii';
import { createEditor, edit, type EditAction } from './edit';
import { newTab, TPQ, type Tab } from './model';

function demo(): Tab {
  const tab = newTab('t1', 'Riff in A', 2);
  tab.tempoBpm = 100;
  tab.capo = 2;
  const [b1, b2] = tab.tracks[0]!.bars as [
    Tab['tracks'][0]['bars'][0],
    Tab['tracks'][0]['bars'][0],
  ];
  b1.chordSymbol = 'Am';
  b1.beats = [
    { durTicks: TPQ, notes: [{ string: 3, fret: 5 }] },
    { durTicks: TPQ / 2, notes: [{ string: 3, fret: 7, tech: 'h' }] },
    { durTicks: TPQ / 2, notes: [{ string: 3, fret: 9, tech: '/' }] },
    { durTicks: TPQ, notes: [{ string: 2, fret: 8, tech: 'b', bendSemis: 2 }] },
    { durTicks: TPQ, notes: [{ string: 2, fret: 8, tech: 'r', bendSemis: 2 }] },
  ];
  b2.chordSymbol = 'G';
  b2.beats = [
    {
      durTicks: TPQ * 1.5,
      notes: [
        { string: 5, fret: 5, tech: 'pm' },
        { string: 6, fret: 3, tech: 'pm' },
      ],
    },
    { durTicks: TPQ / 2, notes: [{ string: 6, fret: 0, tech: 'x' }] },
    { durTicks: TPQ, notes: [], rest: true },
    {
      durTicks: TPQ,
      notes: [
        { string: 1, fret: 12, tech: '~' },
        { string: 2, fret: 10, tech: 'p' },
      ],
    },
  ];
  return tab;
}

describe('ASCII tab', () => {
  it('tokens round-trip', () => {
    for (const n of [
      { string: 0, fret: 7 },
      { string: 0, fret: 12, tech: 'h' as const },
      { string: 0, fret: 3, tech: 'p' as const },
      { string: 0, fret: 9, tech: '/' as const },
      { string: 0, fret: 5, tech: '\\' as const },
      { string: 0, fret: 7, tech: 'b' as const, bendSemis: 2 },
      { string: 0, fret: 7, tech: 'b' as const, bendSemis: 1.5 },
      { string: 0, fret: 7, tech: 'r' as const, bendSemis: 1 },
      { string: 0, fret: 5, tech: '~' as const },
    ])
      expect(parseToken(noteToken(n))).toEqual(n);
    expect(parseToken('x')).toEqual({ string: 0, fret: 0, tech: 'x' });
    expect(parseToken('zz')).toBeNull();
  });

  it('export then import gives the same tab (gate: hammer-on, slide, bend)', () => {
    const tab = demo();
    const text = toAscii(tab);
    expect(text).toContain('Title: Riff in A');
    expect(text).toMatch(/^G\s*\|.*-h7-/m);
    expect(text).toContain('8b10');
    const back = fromAscii(text, 't1');
    expect(back).toEqual(tab);
  });

  it('imports an ordinary tab: names, bar lines, 5h7 runs, no rhythm row', () => {
    const text = [
      'Some song, intro',
      'e|----------0-----|',
      'B|------1-------3-|',
      'G|----2---2-------|',
      'D|-5h7------------|',
      'A|----------------|',
      'E|----------------|',
    ].join('\n');
    const tab = fromAscii(text, 'x');
    const beats = tab.tracks[0]!.bars[0]!.beats;
    expect(
      beats.map((b) => b.notes.map((n) => `${n.string}:${n.tech ?? ''}${n.fret}`).join(',')),
    ).toEqual(['4:5', '4:h7', '3:2', '2:1', '3:2', '1:0', '2:3']);
    expect(beats.reduce((s, b) => s + b.durTicks, 0)).toBeLessThanOrEqual(TPQ * 4);
    expect(tab.tempoBpm).toBe(90);
    expect(tab.tuning).toEqual([64, 59, 55, 50, 45, 40]);
  });

  it('friendly errors for text without a tab', () => {
    expect(() => fromAscii('just some words\nno tab here', 'x')).toThrow(TabParseError);
    expect(() => fromAscii('e|--0--|\nB|--1--|', 'x')).toThrow(/No tab found/);
  });

  it('long tabs wrap into systems of four bars and still round-trip', () => {
    const tab = newTab('t', 'Long', 9);
    tab.tracks[0]!.bars[8]!.beats[0] = { durTicks: TPQ, notes: [{ string: 1, fret: 1 }] };
    const text = toAscii(tab);
    expect(text.split('\n').filter((l) => /^e\s*\|/.test(l))).toHaveLength(3);
    expect(fromAscii(text, 't')).toEqual(tab);
  });

  it('drop D and seven strings come back with their tuning', () => {
    const tab = { ...newTab('t', 'Drop', 1), tuning: [64, 59, 55, 50, 45, 38] };
    expect(fromAscii(toAscii(tab), 't').tuning).toEqual(tab.tuning);
    const seven = { ...newTab('t', 'Seven', 1), tuning: [64, 59, 55, 50, 45, 40, 35] };
    expect(fromAscii(toAscii(seven), 't').tuning).toEqual(seven.tuning);
  });

  it('a tab typed in the editor survives export and import', () => {
    const steps: EditAction[] = [
      { type: 'move', strings: 2 },
      { type: 'fret', fret: 5 },
      { type: 'move', beats: 1 },
      { type: 'fret', fret: 7 },
      { type: 'tech', tech: 'h' },
      { type: 'move', beats: 1 },
      { type: 'fret', fret: 9 },
      { type: 'tech', tech: '/' },
      { type: 'duration', op: 'halve' },
      { type: 'move', beats: 1 },
      { type: 'fret', fret: 8 },
      { type: 'tech', tech: 'b' },
      { type: 'chord', bar: 0, symbol: 'Em' },
    ];
    const s = steps.reduce(edit, createEditor(newTab('e', 'Typed', 2)));
    expect(fromAscii(toAscii(s.tab), 'e')).toEqual(s.tab);
  });
});
