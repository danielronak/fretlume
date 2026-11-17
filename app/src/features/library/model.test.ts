import { describe, expect, it } from 'vitest';
import { libraryCatalogue } from '@core/theory/library/index';
import {
  activeGroupIds,
  chipGroups,
  isValidType,
  itemDetails,
  itemPath,
  LIBRARY_KINDS,
  libraryPath,
  parseRootSlug,
  relatedItems,
  rootSlug,
  typeOptions,
} from './model';

describe('library routes', () => {
  it('writes readable, hash-safe paths', () => {
    expect(libraryPath('chord', 0, 'maj')).toBe('/library/chord/C/maj');
    expect(libraryPath('scale', 6, 'minor-pentatonic')).toBe('/library/scale/Fs/minor-pentatonic');
    expect(libraryPath('key', 10, 'major')).toBe('/library/key/Bb/major');
    expect(libraryPath('chord', 2, '6/9')).toBe('/library/chord/D/6%2F9');
  });

  it('parses every way of writing a root', () => {
    expect(parseRootSlug('C')).toBe(0);
    expect(parseRootSlug('Fs')).toBe(6);
    expect(parseRootSlug('F#')).toBe(6);
    expect(parseRootSlug('Gb')).toBe(6);
    expect(parseRootSlug('bb')).toBe(10);
    expect(parseRootSlug('H')).toBeNull();
    expect(parseRootSlug(undefined)).toBeNull();
    for (let pc = 0; pc < 12; pc++) expect(parseRootSlug(rootSlug(pc))).toBe(pc);
  });

  it('every catalogue item has a valid route', () => {
    for (const item of libraryCatalogue()) {
      const [, , kind, slug, type] = itemPath(item).split('/');
      expect(kind).toBe(item.kind);
      expect(parseRootSlug(slug)).toBe(item.root);
      expect(isValidType(item.kind, decodeURIComponent(type!))).toBe(true);
    }
  });

  it('lists types for every kind', () => {
    for (const kind of LIBRARY_KINDS) expect(typeOptions(kind).length).toBeGreaterThan(1);
    expect(isValidType('chord', 'nope')).toBe(false);
  });
});

describe('item details', () => {
  it('spells notes and formulas', () => {
    expect(itemDetails('chord', 0, 'maj')).toMatchObject({
      id: 'chord-0-maj',
      title: 'C major',
      symbol: 'C',
      notes: ['C', 'E', 'G'],
      formula: ['1', '3', '5'],
    });
    expect(itemDetails('scale', 9, 'minor-pentatonic').notes).toEqual(['A', 'C', 'D', 'E', 'G']);
    expect(itemDetails('triad', 9, 'min').notes).toEqual(['A', 'C', 'E']);
    expect(itemDetails('key', 7, 'major')).toMatchObject({
      title: 'Key of G major',
      formula: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
    });
    expect(itemDetails('arpeggio', 0, 'maj7').title).toBe('C major seventh arpeggio');
  });

  it('every catalogue item has details whose id matches', () => {
    for (const item of libraryCatalogue()) {
      const details = itemDetails(item.kind, item.root, item.typeId);
      expect(details.id).toBe(item.id);
      expect(details.notes.length).toBeGreaterThan(1);
    }
  });

  it('links related items that exist', () => {
    expect(relatedItems('chord', 9, 'min').map((r) => r.label)).toEqual([
      'A minor arpeggio',
      'A minor triads',
      'A minor pentatonic',
      'A Dorian',
      'A natural minor',
    ]);
    expect(relatedItems('scale', 0, 'major').map((r) => r.path)).toContain(
      '/library/scale/A/minor',
    );
    expect(relatedItems('key', 0, 'major').map((r) => r.label)).toEqual([
      'C major scale',
      'Key of A minor',
      'Key of C minor',
    ]);
    for (const item of libraryCatalogue()) {
      for (const related of relatedItems(item.kind, item.root, item.typeId)) {
        expect(related.path.startsWith('/library/')).toBe(true);
      }
    }
  });
});

describe('position chips', () => {
  it('folds octave repeats into one chip', () => {
    expect(chipGroups(['C', 'A', 'G', 'E', 'D', 'C+12'])).toEqual(['C', 'A', 'G', 'E', 'D']);
    expect(activeGroupIds(['C', 'A', 'C+12'], ['C'])).toEqual(['C', 'C+12']);
    expect(activeGroupIds(['C', 'A'], [])).toEqual([]);
  });
});
