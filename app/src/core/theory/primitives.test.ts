import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { degreePc, degreeSemitones, spellDegree } from './degrees';
import {
  centsOff,
  hzToMidi,
  midiName,
  midiToHz,
  noteName,
  parseNote,
  pcName,
  pcPairName,
  spelledPc,
  tonicSpelling,
  transposePc,
} from './pitch';
import {
  customTuning,
  lowestFretOfPc,
  midiAt,
  pcAt,
  positionsOfPc,
  STANDARD_TUNING,
  TUNINGS,
  withCapo,
} from './tuning';

const pcArb = fc.integer({ min: 0, max: 11 });

describe('pitch', () => {
  it('names pitch classes with sharps or flats', () => {
    expect(pcName(1)).toBe('C#');
    expect(pcName(1, 'flat')).toBe('Db');
    expect(pcPairName(6)).toBe('F#/Gb');
    expect(pcPairName(4)).toBe('E');
  });

  it('parses and prints spelled notes', () => {
    expect(parseNote('f#')).toEqual({ letter: 3, accidental: 1 });
    expect(parseNote('Bb')).toEqual({ letter: 6, accidental: -1 });
    expect(parseNote('H')).toBeNull();
    expect(noteName({ letter: 6, accidental: -2 })).toBe('Bbb');
  });

  it('round-trips every tonic spelling', () => {
    for (let pc = 0; pc < 12; pc++) {
      expect(spelledPc(tonicSpelling(pc, 'major'))).toBe(pc);
      expect(spelledPc(tonicSpelling(pc, 'minor'))).toBe(pc);
    }
  });

  it('knows concert pitch', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(40)).toBeCloseTo(82.41, 2); // low E
    expect(midiName(60)).toBe('C4');
    expect(midiName(40)).toBe('E2');
  });

  it('converts frequency to the nearest note and cents', () => {
    const flatA = centsOff(440 * 2 ** (-20 / 1200));
    expect(flatA.midi).toBe(69);
    expect(flatA.cents).toBeCloseTo(-20, 6);
  });

  it('hz ↔ midi round-trips', () => {
    fc.assert(
      fc.property(fc.double({ min: 28, max: 100, noNaN: true }), (midi) => {
        expect(hzToMidi(midiToHz(midi))).toBeCloseTo(midi, 9);
      }),
    );
  });

  it('transposition by 12 is the identity and composes', () => {
    fc.assert(
      fc.property(
        pcArb,
        fc.integer({ min: -48, max: 48 }),
        fc.integer({ min: -48, max: 48 }),
        (pc, a, b) => {
          expect(transposePc(pc, 12)).toBe(pc);
          expect(transposePc(transposePc(pc, a), b)).toBe(transposePc(pc, a + b));
        },
      ),
    );
  });
});

describe('degrees', () => {
  it('maps degrees to semitones', () => {
    expect(
      ['1', 'b3', '3', '4', '#4', 'b5', '5', '#5', '6', 'bb7', 'b7', '7'].map(degreeSemitones),
    ).toEqual([0, 3, 4, 5, 6, 6, 7, 8, 9, 9, 10, 11]);
    expect(['b9', '9', '#9', '11', '#11', 'b13', '13'].map(degreeSemitones)).toEqual([
      13, 14, 15, 17, 18, 20, 21,
    ]);
    expect(degreePc(9, '9')).toBe(11); // the 9th of A is B
  });

  it('rejects nonsense', () => {
    expect(() => degreeSemitones('x')).toThrow();
    expect(() => degreeSemitones('0')).toThrow();
  });

  it('spells scale tones with consecutive letters', () => {
    const major = ['1', '2', '3', '4', '5', '6', '7'];
    const spell = (root: string) => major.map((d) => spellDegree(parseNote(root)!, d)).join(' ');
    expect(spell('A')).toBe('A B C# D E F# G#');
    expect(spell('F#')).toBe('F# G# A# B C# D# E#');
    expect(spell('Db')).toBe('Db Eb F Gb Ab Bb C');
    expect(spell('C')).toBe('C D E F G A B');
  });

  it('spells altered chord tones', () => {
    const c = parseNote('C')!;
    expect(spellDegree(c, 'b3')).toBe('Eb');
    expect(spellDegree(c, 'bb7')).toBe('Bbb');
    expect(spellDegree(c, '#9')).toBe('D#');
    expect(spellDegree(parseNote('E')!, 'b7')).toBe('D');
  });

  it('a spelled degree always sounds the right pitch class', () => {
    const degrees = [
      '1',
      'b2',
      '2',
      'b3',
      '3',
      '4',
      '#4',
      'b5',
      '5',
      '#5',
      'b6',
      '6',
      'bb7',
      'b7',
      '7',
      '9',
      '#11',
      'b13',
    ];
    fc.assert(
      fc.property(
        pcArb,
        fc.constantFrom(...degrees),
        fc.constantFrom('major' as const, 'minor' as const),
        (pc, degree, kind) => {
          const root = tonicSpelling(pc, kind);
          const parsed = parseNote(spellDegree(root, degree));
          expect(parsed).not.toBeNull();
          expect(spelledPc(parsed!)).toBe(degreePc(pc, degree));
        },
      ),
    );
  });
});

describe('tuning', () => {
  it('standard tuning is E A D G B E', () => {
    expect(
      [6, 5, 4, 3, 2, 1].map((s) => pcName(pcAt(STANDARD_TUNING, { string: s, fret: 0 }))),
    ).toEqual(['E', 'A', 'D', 'G', 'B', 'E']);
    expect(midiAt(STANDARD_TUNING, { string: 6, fret: 5 })).toBe(45); // A2, same as open 5th string
    expect(midiAt(STANDARD_TUNING, { string: 2, fret: 1 })).toBe(60); // middle C
  });

  it('presets are ordered high string first and ascend', () => {
    for (const t of Object.values(TUNINGS)) {
      expect(t.strings).toHaveLength(6);
      for (let i = 1; i < t.strings.length; i++)
        expect(t.strings[i - 1]!).toBeGreaterThan(t.strings[i]!);
    }
    expect(pcName(pcAt(TUNINGS.dropD, { string: 6, fret: 0 }))).toBe('D');
  });

  it('a capo raises open strings', () => {
    const capo2 = withCapo(STANDARD_TUNING, 2);
    expect(pcName(pcAt(capo2, { string: 6, fret: 0 }))).toBe('F#');
    expect(withCapo(STANDARD_TUNING, 0)).toBe(STANDARD_TUNING);
  });

  it('finds every position of a pitch class', () => {
    const positions = positionsOfPc(STANDARD_TUNING, 0, 12); // all the C notes up to fret 12
    expect(positions).toEqual([
      { string: 6, fret: 8 },
      { string: 5, fret: 3 },
      { string: 4, fret: 10 },
      { string: 3, fret: 5 },
      { string: 2, fret: 1 },
      { string: 1, fret: 8 },
    ]);
    expect(lowestFretOfPc(STANDARD_TUNING, 6, 7)).toBe(3); // G on the low E string
  });

  it('positionsOfPc returns exactly the matching frets, for any tuning', () => {
    const tuningArb = fc
      .array(fc.integer({ min: 28, max: 70 }), { minLength: 4, maxLength: 8 })
      .map((notes) => customTuning([...notes].sort((a, b) => a - b)));
    fc.assert(
      fc.property(tuningArb, pcArb, fc.integer({ min: 0, max: 24 }), (t, pc, maxFret) => {
        const found = new Set(positionsOfPc(t, pc, maxFret).map((p) => `${p.string}:${p.fret}`));
        for (let string = 1; string <= t.strings.length; string++) {
          for (let fret = 0; fret <= maxFret; fret++) {
            expect(found.has(`${string}:${fret}`)).toBe(pcAt(t, { string, fret }) === pc);
          }
        }
      }),
      { numRuns: 60 },
    );
  });
});
