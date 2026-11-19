import { describe, expect, it } from 'vitest';
import { TabParseError } from './ascii';
import { fromChordPro, looksLikeChordPro } from './chordpro';

const SHEET = [
  '{title: Morning Walk}',
  '{tempo: 76}',
  '{time: 3/4}',
  '{capo: 2}',
  '# our own words, written for this test',
  '[G]Out along the [C]river [G]road',
  '{start_of_chorus}',
  '[Em]Slow and [D7]steady',
  '{end_of_chorus}',
].join('\n');

describe('ChordPro import', () => {
  it('reads directives and one bar per chord, with a strum on every beat', () => {
    expect(looksLikeChordPro(SHEET)).toBe(true);
    const tab = fromChordPro(SHEET, 'c');
    expect([tab.title, tab.tempoBpm, tab.capo, tab.timeSig]).toEqual([
      'Morning Walk',
      76,
      2,
      [3, 4],
    ]);
    const bars = tab.tracks[0]!.bars;
    expect(bars.map((b) => b.chordSymbol)).toEqual(['G', 'C', 'G', 'Em', 'D7']);
    expect(bars[0]!.beats).toHaveLength(3);
    // Open G: 3-2-0-0-0-3 low to high.
    expect(bars[0]!.beats[0]!.notes.map((n) => n.fret)).toEqual([3, 0, 0, 0, 2, 3]);
  });

  it('reads plain chord-over-words sheets', () => {
    const tab = fromChordPro('Am    F\nwords here\nC  |  G  |\nmore words', 'p');
    expect(tab.tracks[0]!.bars.map((b) => b.chordSymbol)).toEqual(['Am', 'F', 'C', 'G']);
  });

  it('text that is not a chord is skipped; no chords at all is a friendly error', () => {
    const tab = fromChordPro('[C]la [Q7]la', 'u');
    expect(tab.tracks[0]!.bars.map((b) => b.chordSymbol)).toEqual(['C']);
    expect(() => fromChordPro('only words\nand more words', 'n')).toThrow(TabParseError);
  });
});
