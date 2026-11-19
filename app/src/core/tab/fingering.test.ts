import { describe, expect, it } from 'vitest';
import { placePitches } from './fingering';
import { STANDARD_TAB_TUNING } from './model';

describe('placePitches', () => {
  it('puts a C major triad near the nut on separate strings', () => {
    const { notes } = placePitches([48, 52, 55], STANDARD_TAB_TUNING, 0, 0);
    expect(notes).toEqual([
      { string: 3, fret: 0 },
      { string: 4, fret: 2 },
      { string: 5, fret: 3 },
    ]);
  });

  it('follows the hand up the neck', () => {
    // A4 (69) with the hand at fret 9: B string fret 10 is nearest.
    expect(placePitches([69], STANDARD_TAB_TUNING, 0, 9).notes).toEqual([{ string: 2, fret: 10 }]);
    expect(placePitches([69], STANDARD_TAB_TUNING, 0, 0).notes).toEqual([{ string: 1, fret: 5 }]);
  });

  it('counts frets from the capo and drops pitches that do not fit', () => {
    expect(placePitches([42], STANDARD_TAB_TUNING, 2, 0).notes).toEqual([{ string: 6, fret: 0 }]);
    expect(placePitches([30, 120], STANDARD_TAB_TUNING, 0, 0).notes).toEqual([]);
  });

  it('every placed note sounds the pitch asked for (property)', () => {
    for (let midi = 40; midi <= 88; midi++)
      for (const hand of [0, 5, 12]) {
        const [n] = placePitches([midi], STANDARD_TAB_TUNING, 0, hand).notes;
        expect(STANDARD_TAB_TUNING[n!.string - 1]! + n!.fret).toBe(midi);
      }
  });
});
