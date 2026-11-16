import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseNote, spelledPc } from '../pitch';
import { pcAt, STANDARD_TUNING, TUNINGS } from '../tuning';
import type { Mark } from '../types';
import {
  cagedPositions,
  fullNeckMarks,
  scaleDef,
  scaleName,
  scaleNoteNames,
  scalePcs,
  scalePositionShape,
  SCALES,
  scaleShape,
  scaleTones,
  threeNpsPositions,
} from './index';

const pc = (name: string) => spelledPc(parseNote(name)!);

/** Frets per string, low string first: [[5,8],[5,7],…]. */
const byString = (marks: Mark[]) =>
  [6, 5, 4, 3, 2, 1].map((s) =>
    marks
      .filter((m) => m.string === s)
      .map((m) => m.fret)
      .sort((a, b) => a - b),
  );

const position = (root: string, scale: string, form: string, maxFret = 15) =>
  cagedPositions(scaleTones(pc(root), scaleDef(scale)), { maxFret }).find((p) => p.id === form)!;

describe('scale table', () => {
  it('has at least 20 scales with unique ids', () => {
    expect(SCALES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(SCALES.map((s) => s.id)).size).toBe(SCALES.length);
  });

  it('every scale starts on 1 and ascends within the octave', () => {
    for (const scale of SCALES) {
      expect(scale.degrees[0], scale.id).toBe('1');
      const steps = scalePcs(0, scale);
      for (let i = 1; i < steps.length; i++)
        expect(steps[i]!, scale.id).toBeGreaterThan(steps[i - 1]!);
      expect(new Set(steps).size, scale.id).toBe(steps.length);
    }
  });

  it('spells scales for their key', () => {
    expect(scaleNoteNames(pc('A'), scaleDef('major')).join(' ')).toBe('A B C# D E F# G#');
    expect(scaleNoteNames(pc('A'), scaleDef('minor-pentatonic')).join(' ')).toBe('A C D E G');
    expect(scaleNoteNames(pc('C'), scaleDef('minor')).join(' ')).toBe('C D Eb F G Ab Bb');
    expect(scaleNoteNames(pc('E'), scaleDef('phrygian-dominant')).join(' ')).toBe('E F G# A B C D');
    expect(scaleName(pc('Bb'), scaleDef('mixolydian'))).toBe('Bb Mixolydian');
    expect(scaleName(pc('C#'), scaleDef('minor'))).toBe('C# natural minor');
  });
});

describe('CAGED positions', () => {
  it('A minor pentatonic box 1 is the E shape at the fifth fret', () => {
    const box1 = position('A', 'minor-pentatonic', 'E');
    expect(box1.window).toEqual([4, 8]);
    expect(byString(box1.marks)).toEqual([
      [5, 8],
      [5, 7],
      [5, 7],
      [5, 7],
      [5, 8],
      [5, 8],
    ]);
  });

  it('G major in the E shape sits at frets 2–5', () => {
    expect(byString(position('G', 'major', 'E').marks)).toEqual([
      [2, 3, 5],
      [2, 3, 5],
      [2, 4, 5],
      [2, 4, 5],
      [3, 5],
      [2, 3, 5],
    ]);
  });

  it('C major open position is the C shape', () => {
    const open = position('C', 'major', 'C');
    expect(open.window).toEqual([0, 3]);
    expect(byString(open.marks)).toEqual([
      [0, 1, 3],
      [0, 2, 3],
      [0, 2, 3],
      [0, 2],
      [0, 1, 3],
      [0, 1, 3],
    ]);
  });

  it('E minor pentatonic open position uses the open strings', () => {
    expect(byString(position('E', 'minor-pentatonic', 'E').marks)).toEqual([
      [0, 3],
      [0, 2],
      [0, 2],
      [0, 2],
      [0, 3],
      [0, 3],
    ]);
  });

  it('positions run up the neck in the right order of forms', () => {
    const forms = (root: string, scale: string) =>
      cagedPositions(scaleTones(pc(root), scaleDef(scale)), { maxFret: 15 }).map((p) => p.id);
    expect(forms('C', 'major')).toEqual(['C', 'A', 'G', 'E', 'D', 'C+12']);
    expect(forms('A', 'minor-pentatonic')).toEqual(['A', 'G', 'E', 'D', 'C', 'A+12']);
    expect(forms('G', 'major')).toEqual(['E', 'D', 'C', 'A', 'G']);
  });

  it('every position of every scale and key is in tune with the scale and fits the hand', () => {
    for (const scale of SCALES) {
      for (let root = 0; root < 12; root++) {
        const tones = new Set(scalePcs(root, scale));
        const positions = cagedPositions(scaleTones(root, scale), { maxFret: 22 });
        expect(positions.length, `${scale.id} ${root}`).toBeGreaterThanOrEqual(5);
        for (const p of positions) {
          const label = `${scale.id} root ${root} ${p.id}`;
          expect(p.window[1] - p.window[0], label).toBeLessThanOrEqual(4); // at most five frets
          for (const m of p.marks) {
            expect(tones.has(m.pc), label).toBe(true);
            expect(m.fret, label).toBeGreaterThanOrEqual(p.window[0]);
            expect(m.fret, label).toBeLessThanOrEqual(p.window[1]);
            expect(m.groups).toEqual([p.id]);
          }
          // Every string has something to play, and the tonic is in the position.
          for (let s = 1; s <= 6; s++) {
            expect(
              p.marks.some((m) => m.string === s),
              `${label} string ${s}`,
            ).toBe(true);
          }
          expect(
            p.marks.some((m) => m.role === 'root'),
            label,
          ).toBe(true);
        }
      }
    }
  });

  it('the positions together cover exactly the scale between the first and last window', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 11 }), fc.constantFrom(...SCALES), (root, scale) => {
        const tones = scaleTones(root, scale);
        const positions = cagedPositions(tones, { maxFret: 22 });
        const lo = Math.min(...positions.map((p) => p.window[0]));
        const hi = Math.max(...positions.map((p) => p.window[1]));
        const covered = new Set(
          positions.flatMap((p) => p.marks.map((m) => `${m.string}:${m.fret}`)),
        );
        const expected = new Set(
          fullNeckMarks(tones, { maxFret: 22 })
            .filter((m) => m.fret >= lo && m.fret <= hi)
            .map((m) => `${m.string}:${m.fret}`),
        );
        expect(covered).toEqual(expected);
      }),
    );
  });

  it('modes reuse the fingerings of their parent scale, shifted', () => {
    // D Dorian has the notes of C major, so the whole-neck picture is identical.
    const key = (marks: Mark[]) =>
      marks
        .map((m) => `${m.string}:${m.fret}`)
        .sort()
        .join(' ');
    expect(key(fullNeckMarks(scaleTones(pc('D'), scaleDef('dorian'))))).toBe(
      key(fullNeckMarks(scaleTones(pc('C'), scaleDef('major')))),
    );
  });

  it('marks carry degrees, note names and roots', () => {
    const box1 = position('A', 'minor-pentatonic', 'E');
    const low = box1.marks.find((m) => m.string === 6 && m.fret === 5)!;
    expect(low).toMatchObject({ note: 'A', degree: '1', role: 'root' });
    const third = box1.marks.find((m) => m.string === 6 && m.fret === 8)!;
    expect(third).toMatchObject({ note: 'C', degree: 'b3', role: 'tone' });
  });

  it('is empty for tunings without standard intervals, and scaleShape falls back to the whole neck', () => {
    const tones = scaleTones(pc('D'), scaleDef('major'));
    expect(cagedPositions(tones, { tuning: TUNINGS.dadgad })).toEqual([]);
    const shape = scaleShape(pc('D'), 'major', 'caged', { tuning: TUNINGS.dadgad });
    expect(shape.groups).toEqual([]);
    const allowed = new Set(scalePcs(pc('D'), scaleDef('major')));
    expect(shape.marks.length).toBeGreaterThan(30);
    expect(shape.marks.every((m) => allowed.has(pcAt(TUNINGS.dadgad, m)))).toBe(true);
  });
});

describe('scaleShape', () => {
  it('shared notes between neighbouring positions carry both groups', () => {
    const shape = scaleShape(pc('A'), 'major', 'caged');
    expect(shape.title).toBe('A major');
    expect(shape.groups.map((g) => g.id).slice(0, 5)).toEqual(['G', 'E', 'D', 'C', 'A']);
    expect(shape.marks.some((m) => m.groups.length === 2)).toBe(true);
    expect(shape.marks.every((m) => m.groups.length >= 1 && m.groups.length <= 2)).toBe(true);
  });

  it('one position on its own', () => {
    const shape = scalePositionShape(pc('A'), 'minor-pentatonic', 'E')!;
    expect(shape.title).toBe('A minor pentatonic, E shape');
    expect(shape.window).toEqual([5, 8]);
    expect(scalePositionShape(pc('A'), 'minor-pentatonic', 'nope')).toBeNull();
  });
});

describe('three notes per string', () => {
  it('G major position 1 starts on the root at the third fret', () => {
    const positions = threeNpsPositions(scaleTones(pc('G'), scaleDef('major')), { maxFret: 22 });
    expect(positions).toHaveLength(7);
    const first = positions.find((p) => p.index === 1)!;
    expect(byString(first.marks)).toEqual([
      [3, 5, 7],
      [3, 5, 7],
      [4, 5, 7],
      [4, 5, 7],
      [5, 7, 8],
      [5, 7, 8],
    ]);
  });

  it('every position has exactly three scale notes per string within reach', () => {
    for (const scale of SCALES.filter((s) => s.degrees.length === 7)) {
      for (let root = 0; root < 12; root++) {
        const tones = new Set(scalePcs(root, scale));
        for (const p of threeNpsPositions(scaleTones(root, scale), { maxFret: 24 })) {
          for (const frets of byString(p.marks)) {
            expect(frets, `${scale.id} ${root} ${p.id}`).toHaveLength(3);
            expect(frets[2]! - frets[0]!, `${scale.id} ${root} ${p.id}`).toBeLessThanOrEqual(5);
          }
          expect(p.marks.every((m) => tones.has(m.pc) && m.fret >= 0)).toBe(true);
        }
      }
    }
  });

  it('only applies to seven-note scales', () => {
    expect(threeNpsPositions(scaleTones(0, scaleDef('minor-pentatonic')))).toEqual([]);
    // scaleShape then falls back to the whole neck.
    expect(scaleShape(0, 'minor-pentatonic', 'nps').groups).toEqual([]);
  });
});

describe('full neck', () => {
  it('contains every scale tone up to the last fret and nothing else', () => {
    const marks = fullNeckMarks(scaleTones(pc('C'), scaleDef('major')), { maxFret: 12 });
    const natural = new Set([0, 2, 4, 5, 7, 9, 11]);
    let expected = 0;
    for (let s = 1; s <= 6; s++)
      for (let f = 0; f <= 12; f++)
        if (natural.has(pcAt(STANDARD_TUNING, { string: s, fret: f }))) expected++;
    expect(marks).toHaveLength(expected);
  });
});
