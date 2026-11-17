import { describe, expect, it } from 'vitest';
import { TUNINGS } from '@core/theory/tuning';
import { buildDeck } from './deck';

const std = TUNINGS.standard;

describe('buildDeck', () => {
  it('chords: all CAGED shapes, one per shape, then voicings', () => {
    const deck = buildDeck('chord', 0, 'maj', std, 15);
    expect(deck.title).toBe('C major');
    expect(deck.entries[0]!.label).toBe('All shapes');
    expect(deck.entries[0]!.activeGroups).toEqual([]);
    const shapeEntries = deck.entries.filter((e) => e.activeGroups.length > 0);
    expect(shapeEntries.length).toBe(5);
    expect(deck.entries.some((e) => e.label.startsWith('Voicing 1 · x32010'))).toBe(true);
  });

  it('scales: positions; triads: four string sets from the treble side', () => {
    const scale = buildDeck('scale', 9, 'minor-pentatonic', std, 15);
    expect(scale.entries.length).toBeGreaterThan(2);
    const triads = buildDeck('triad', 7, 'maj', std, 15);
    expect(triads.entries.map((e) => e.label)).toEqual([
      'Strings 3-2-1',
      'Strings 4-3-2',
      'Strings 5-4-3',
      'Strings 6-5-4',
    ]);
  });

  it('keys and arpeggios produce shapes with marks', () => {
    for (const deck of [
      buildDeck('key', 2, 'major', std, 15),
      buildDeck('arpeggio', 0, 'maj7', std, 15),
    ])
      expect(deck.entries.every((e) => e.shape.marks.length > 0)).toBe(true);
  });
});
