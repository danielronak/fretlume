import { describe, expect, it } from 'vitest';
import { parseChordSymbol, parseProgression } from './parse';

describe('chord symbols', () => {
  it('roots with accidentals and common suffixes', () => {
    expect(parseChordSymbol('C')).toEqual({ root: 0, qualityId: 'maj', symbol: 'C' });
    expect(parseChordSymbol('Am')).toMatchObject({ root: 9, qualityId: 'min' });
    expect(parseChordSymbol('F#m7')).toMatchObject({ root: 6, qualityId: 'm7' });
    expect(parseChordSymbol('Bbmaj7')).toMatchObject({ root: 10, qualityId: 'maj7' });
    expect(parseChordSymbol('E♭7')).toMatchObject({ root: 3, qualityId: '7' });
    expect(parseChordSymbol('G7sus4')).toMatchObject({ root: 7, qualityId: '7sus4' });
    expect(parseChordSymbol('Dsus')).toMatchObject({ root: 2, qualityId: 'sus4' });
  });

  it('case matters for M (major) and m (minor); aliases work', () => {
    expect(parseChordSymbol('CM7')).toMatchObject({ qualityId: 'maj7' });
    expect(parseChordSymbol('Cm7')).toMatchObject({ qualityId: 'm7' });
    expect(parseChordSymbol('Cmin7')).toMatchObject({ qualityId: 'm7' });
    expect(parseChordSymbol('C-7')).toMatchObject({ qualityId: 'm7' });
    expect(parseChordSymbol('Bø')).toMatchObject({ qualityId: 'm7b5' });
    expect(parseChordSymbol('B°')).toMatchObject({ qualityId: 'dim' });
  });

  it('slash chords keep the chord and ignore the bass; nonsense is null', () => {
    expect(parseChordSymbol('C/G')).toMatchObject({ root: 0, qualityId: 'maj' });
    expect(parseChordSymbol('H7')).toBeNull();
    expect(parseChordSymbol('Cxyz')).toBeNull();
    expect(parseChordSymbol('')).toBeNull();
  });
});

describe('progressions', () => {
  it('splits on spaces, bars, commas and dashes; reports what it could not read', () => {
    const p = parseProgression('C G | Am, F - Dm7  Qx  G7');
    expect(p.chords.map((c) => c.symbol)).toEqual(['C', 'G', 'Am', 'F', 'Dm7', 'G7']);
    expect(p.unknown).toEqual(['Qx']);
  });
  it('an empty text is an empty progression', () => {
    expect(parseProgression('   ')).toEqual({ chords: [], unknown: [] });
  });
});
