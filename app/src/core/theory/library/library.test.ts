import { describe, expect, it } from 'vitest';
import { catalogueCounts, libraryCatalogue, libraryItem, rootNames } from './catalogue';
import { parseQuery, searchLibrary, withinOneEdit } from './search';

describe('catalogue', () => {
  it('covers every root for every type, with unique ids', () => {
    const items = libraryCatalogue();
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(catalogueCounts()).toEqual({ chord: 312, scale: 264, triad: 48, key: 24, arpeggio: 96 });
    expect(libraryItem('chord-0-maj7')?.title).toBe('C major seventh');
    expect(libraryItem('scale-9-minor-pentatonic')?.title).toBe('A minor pentatonic');
    expect(libraryItem('nope')).toBeUndefined();
  });

  it('marks open chords as easier than the same chord as a barre shape', () => {
    expect(libraryItem('chord-0-maj')?.tags).toContain('open');
    expect(libraryItem('chord-1-maj')?.tags).toContain('barre');
    expect(libraryItem('chord-0-maj')!.difficulty).toBeLessThan(
      libraryItem('chord-1-maj')!.difficulty,
    );
  });

  it('knows both spellings of a root', () => {
    expect(rootNames(1).sort()).toEqual(['c#', 'db']);
    expect(rootNames(0)).toEqual(['c']);
  });
});

describe('query parsing', () => {
  it('reads kind, root, symbol and mood', () => {
    expect(parseQuery('sad chords in G')).toMatchObject({ kind: 'chord', root: 7, terms: ['sad'] });
    expect(parseQuery('Am7')).toMatchObject({ chord: { root: 9, qualityId: 'm7' } });
    expect(parseQuery('CM7').chord).toEqual({ root: 0, qualityId: 'maj7' });
    expect(parseQuery('Cm7').chord).toEqual({ root: 0, qualityId: 'm7' });
    expect(parseQuery('f sharp minor')).toMatchObject({ root: 6, terms: ['minor'] });
    expect(parseQuery('easy F')).toMatchObject({ easy: true, root: 5 });
    expect(parseQuery('what has C E G').notes).toEqual([0, 4, 7]);
  });

  it('does not mistake the article "a" for the note A', () => {
    expect(parseQuery('a sad chord').root).toBeUndefined();
    expect(parseQuery('bluesy scale A').root).toBe(9);
    expect(parseQuery('a minor').root).toBe(9);
    expect(parseQuery('show me a scale in A').root).toBe(9);
  });

  it('tolerates one typo in longer words only', () => {
    expect(withinOneEdit('mixolydian', 'mixolidian')).toBe(true);
    expect(withinOneEdit('pentatonic', 'pentatonc')).toBe(true);
    expect(withinOneEdit('dorian', 'lydian')).toBe(false);
    expect(withinOneEdit('sad', 'mad')).toBe(false);
  });
});

/** [query, id expected first] */
const TOP: [string, string][] = [
  ['Am7', 'chord-9-m7'],
  ['C', 'chord-0-maj'],
  ['C#m', 'chord-1-min'],
  ['Bbmaj7', 'chord-10-maj7'],
  ['F#m7b5', 'chord-6-m7b5'],
  ['G7', 'chord-7-7'],
  ['Dsus4', 'chord-2-sus4'],
  ['E5', 'chord-4-5'],
  ['CM7', 'chord-0-maj7'],
  ['Cm7', 'chord-0-m7'],
  ['C6/9', 'chord-0-6/9'],
  ['Csus2', 'chord-0-sus2'],
  ['Bb', 'chord-10-maj'],
  ['A minor', 'chord-9-min'],
  ['A minor scale', 'scale-9-minor'],
  ['G major scale', 'scale-7-major'],
  ['b flat major scale', 'scale-10-major'],
  ['f sharp minor', 'chord-6-min'],
  ['sad chords in G', 'chord-7-min'],
  ['a sad chord', 'chord-0-min'],
  ['sad', 'chord-0-min'],
  ['bluesy scale A', 'scale-9-blues'],
  ['blues scale E', 'scale-4-blues'],
  ['E blues', 'scale-4-blues'],
  ['show me a scale for blues in A', 'scale-9-blues'],
  ['easy F', 'chord-5-maj'],
  ['easy chords', 'chord-0-maj'],
  ['beginner scale', 'scale-0-minor-pentatonic'],
  ['C triads', 'triad-0-maj'],
  ['minor triads A', 'triad-9-min'],
  ['what has C E G', 'chord-0-maj'],
  ['what has A C E', 'chord-9-min'],
  ['notes G B D F', 'chord-7-7'],
  ['what has E G B D', 'chord-4-m7'],
  ['key of G', 'key-7-major'],
  ['E minor key', 'key-4-minor'],
  ['D dorian', 'scale-2-dorian'],
  ['phrygian E', 'scale-4-phrygian'],
  ['locrian B', 'scale-11-locrian'],
  ['lydian', 'scale-0-lydian'],
  ['whole tone', 'scale-0-whole-tone'],
  ['harmonic minor A', 'scale-9-harmonic-minor'],
  ['A pentatonic', 'scale-9-minor-pentatonic'],
  ['major pentatonic G', 'scale-7-major-pentatonic'],
  ['Eb minor pentatonic', 'scale-3-minor-pentatonic'],
  ['mixolidian G', 'scale-7-mixolydian'],
  ['pentatonc A', 'scale-9-minor-pentatonic'],
  ['jazzy chords in C', 'chord-0-maj7'],
  ['funky chord E', 'chord-4-7'],
  ['power chord A', 'chord-9-5'],
  ['diminished chord B', 'chord-11-dim'],
  ['B half diminished', 'chord-11-m7b5'],
  ['c major 7', 'chord-0-maj7'],
  ['g seventh', 'chord-7-7'],
  ['minor seventh d', 'chord-2-m7'],
  ['dom7 G', 'chord-7-7'],
  ['augmented', 'chord-0-aug'],
  ['arpeggio Cmaj7', 'arpeggio-0-maj7'],
  ['Am7 arpeggio', 'arpeggio-9-m7'],
  ['metal scale', 'scale-0-minor'],
  ['happy scale', 'scale-0-major-pentatonic'],
  ['country', 'chord-0-maj'],
];

describe('search', () => {
  it('has at least 60 query expectations', () => {
    expect(TOP.length).toBeGreaterThanOrEqual(60);
  });

  it.each(TOP)('"%s" → %s', (query, expected) => {
    expect(searchLibrary(query, 3)[0]?.id).toBe(expected);
  });

  it('offers sensible runners-up', () => {
    const ids = (q: string) => searchLibrary(q, 3).map((i) => i.id);
    expect(ids('sad chords in G')).toContain('chord-7-m7');
    expect(ids('bluesy scale A')).toContain('scale-9-minor-pentatonic');
    expect(searchLibrary('A minor', 5).map((i) => i.id)).toContain('scale-9-minor');
    expect(ids('Am7')).toContain('arpeggio-9-m7');
  });

  it('filters by kind and mood', () => {
    expect(searchLibrary('triads on top three strings', 50).every((i) => i.kind === 'triad')).toBe(
      true,
    );
    const spanish = searchLibrary('spanish scale', 5);
    expect(spanish.length).toBeGreaterThan(0);
    expect(spanish.every((i) => i.kind === 'scale' && i.tags.includes('spanish'))).toBe(true);
    const dreamy = searchLibrary('dreamy chord D', 3);
    expect(dreamy.every((i) => i.root === 2 && i.tags.includes('dreamy'))).toBe(true);
    expect(searchLibrary('easy chords', 100).every((i) => i.difficulty <= 2)).toBe(true);
  });

  it('returns nothing for empty or meaningless input', () => {
    expect(searchLibrary('')).toEqual([]);
    expect(searchLibrary('   ')).toEqual([]);
    expect(searchLibrary('zzzzqqq')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(searchLibrary('chords', 7)).toHaveLength(7);
  });
});
