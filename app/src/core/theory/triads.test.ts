import { describe, expect, it } from 'vitest';
import { arpeggioShape, intervalShape, noteFinderShape } from './extras';
import { parseNote, spelledPc } from './pitch';
import {
  STRING_SETS,
  TRIAD_QUALITIES,
  triadShape,
  triadVoicings,
  type TriadQuality,
} from './triads';

const pc = (name: string) => spelledPc(parseNote(name)!);

describe('triads', () => {
  it('C major on the top three strings cycles 2nd → root → 1st → 2nd going up', () => {
    const voicings = triadVoicings(pc('C'), 'maj', '321', { maxFret: 13 });
    // positions are listed lowest string first: G, B, e
    expect(voicings.map((v) => [v.inversion, ...v.positions.map((p) => p.fret)])).toEqual([
      ['2nd', 0, 1, 0],
      ['root', 5, 5, 3],
      ['1st', 9, 8, 8],
      ['2nd', 12, 13, 12],
    ]);
  });

  it('there are exactly three voicings per string set per octave, one of each inversion', () => {
    for (const quality of Object.keys(TRIAD_QUALITIES) as TriadQuality[]) {
      for (const set of STRING_SETS) {
        for (let root = 0; root < 12; root++) {
          const inOctave = triadVoicings(root, quality, set, { maxFret: 24 }).filter(
            (v) => v.positions[0].fret >= 4 && v.positions[0].fret <= 15,
          );
          expect(inOctave, `${quality} ${set} ${root}`).toHaveLength(3);
          expect(new Set(inOctave.map((v) => v.inversion)).size).toBe(3);
        }
      }
    }
  });

  it('every voicing is a close triad that fits under the hand', () => {
    for (const quality of Object.keys(TRIAD_QUALITIES) as TriadQuality[]) {
      for (const set of STRING_SETS) {
        for (const v of triadVoicings(pc('E'), quality, set, { maxFret: 22 })) {
          const frets = v.positions.map((p) => p.fret);
          expect(Math.max(...frets) - Math.min(...frets), `${quality} ${set}`).toBeLessThanOrEqual(
            4,
          );
        }
      }
    }
  });

  it('the shape groups notes by inversion and names them', () => {
    const shape = triadShape(pc('C'), 'maj', '321');
    expect(shape.title).toBe('C major triads');
    expect(shape.groups.map((g) => g.id)).toEqual(['root', '1st', '2nd']);
    expect(new Set(shape.marks.map((m) => m.note))).toEqual(new Set(['C', 'E', 'G']));
    expect(shape.marks.every((m) => [1, 2, 3].includes(m.string))).toBe(true);
    const minor = triadShape(pc('A'), 'min', '543');
    expect(new Set(minor.marks.map((m) => m.degree))).toEqual(new Set(['1', 'b3', '5']));
  });
});

describe('arpeggios, intervals, note finder', () => {
  it('an arpeggio holds only chord tones, in CAGED positions', () => {
    const shape = arpeggioShape(pc('C'), 'maj7');
    expect(shape.title).toBe('C major seventh arpeggio');
    expect(new Set(shape.marks.map((m) => m.note))).toEqual(new Set(['C', 'E', 'G', 'B']));
    expect(shape.groups.length).toBeGreaterThanOrEqual(5);
  });

  it('finds the octave shapes around a note', () => {
    const shape = intervalShape({ string: 6, fret: 3 }, 12); // G on the low E string
    expect(shape.title).toBe('octave above G');
    expect(shape.marks.map((m) => `${m.string}:${m.fret}`)).toEqual(['6:3', '4:5', '3:0']);
    const fifth = intervalShape({ string: 5, fret: 3 }, 7); // C → G
    expect(fifth.marks.map((m) => `${m.string}:${m.fret}:${m.note}`)).toEqual([
      '5:3:C',
      '4:5:G',
      '3:0:G',
    ]);
  });

  it('finds every C on the neck', () => {
    const shape = noteFinderShape(pc('C'), { maxFret: 15 });
    expect(shape.marks.map((m) => `${m.string}:${m.fret}`)).toEqual([
      '6:8',
      '5:3',
      '5:15',
      '4:10',
      '3:5',
      '2:1',
      '2:13',
      '1:8',
    ]);
    expect(shape.marks.every((m) => m.role === 'root')).toBe(true);
  });
});
