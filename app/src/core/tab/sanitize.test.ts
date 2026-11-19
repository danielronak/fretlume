import { describe, expect, it } from 'vitest';
import { newTab, TPQ } from './model';
import { sanitizeTab } from './sanitize';

describe('sanitizeTab', () => {
  it('keeps a good tab unchanged', () => {
    const tab = { ...newTab('a', 'A', 2), updatedAt: 5 };
    tab.tracks[0]!.bars[0]!.beats[0] = {
      durTicks: TPQ,
      notes: [
        { string: 2, fret: 3, tech: 'h' },
        { string: 3, fret: 7, tech: 'b', bendSemis: 1 },
      ],
    };
    tab.tracks[0]!.bars[1]!.chordSymbol = 'G';
    expect(sanitizeTab(structuredClone(tab))).toEqual(tab);
  });

  it('rejects what is not a tab', () => {
    for (const raw of [null, 3, 'x', {}, { id: 'a', tuning: [1, 2], tracks: [] }])
      expect(sanitizeTab(raw)).toBeNull();
    expect(sanitizeTab({ ...newTab('a', 'A'), tracks: [{ bars: [] }] })).toBeNull();
  });

  it('drops bad notes, clamps numbers and makes the form canonical', () => {
    const raw = {
      id: 'z',
      title: '  ',
      tuning: [64, 59, 55, 50, 45, 40],
      capo: 40,
      tempoBpm: 9000,
      timeSig: [5, 3],
      tracks: [
        {
          bars: [
            {
              chordSymbol: ' Am ',
              beats: [
                {
                  durTicks: 1,
                  rest: false,
                  notes: [
                    { string: 3, fret: 5, tech: 'zz' },
                    { string: 1, fret: 99 },
                    { string: 9, fret: 1 },
                    { string: 2, fret: 1, tech: 'b', bendSemis: 77 },
                    { string: 3, fret: 6 },
                  ],
                },
                { durTicks: TPQ, notes: [{ string: 1.5, fret: 1 }] },
                'junk',
              ],
            },
            { beats: [] },
          ],
        },
      ],
    };
    expect(sanitizeTab(raw)).toEqual({
      id: 'z',
      title: 'Untitled tab',
      tuning: [64, 59, 55, 50, 45, 40],
      capo: 12,
      tempoBpm: 400,
      timeSig: [4, 4],
      tracks: [
        {
          bars: [
            {
              chordSymbol: 'Am',
              beats: [
                {
                  durTicks: TPQ / 8,
                  notes: [
                    { string: 2, fret: 1, tech: 'b', bendSemis: 2 },
                    { string: 3, fret: 5 },
                  ],
                },
                { durTicks: TPQ, notes: [], rest: true },
              ],
            },
          ],
        },
      ],
    });
  });

  it('uses a fallback id for files without one', () => {
    const { id: _id, ...rest } = newTab('a', 'A');
    void _id;
    expect(sanitizeTab(rest, 'new')?.id).toBe('new');
  });
});
