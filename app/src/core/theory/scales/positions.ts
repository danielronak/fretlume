/**
 * Positions on the neck for any set of degrees (scales and arpeggios):
 * the whole neck, the five CAGED positions, and three-notes-per-string.
 *
 * CAGED positions are defined by fret windows relative to r6, the fret of the tonic on the
 * lowest string. A position contains every tone of the scale inside its window, so both E
 * strings always match. Windows for tonics with a major third, in neck order:
 *   E [r6−1, r6+2] · D [r6+1, r6+5] · C [r6+4, r6+7] · A [r6+6, r6+10] · G [r6+8, r6+12]
 * and for tonics with a minor third (the relative major's windows, renamed after the minor
 * chord form that sits in them):
 *   E [r6−1, r6+3] · D [r6+2, r6+5] · C [r6+4, r6+8] · A [r6+7, r6+10] · G [r6+9, r6+13]
 * (docs/specs/03-theory-content.md §3, DECISIONS D-009).
 */
import { degreePc } from '../degrees';
import { mod, noteName, tonicSpelling, type TonicKind } from '../pitch';
import { makeMarks, makeShape, mergeMarks } from '../shape';
import { lowestFretOfPc, openMidi, pcAt, STANDARD_TUNING } from '../tuning';
import type { Mark, PitchClass, Position, Shape, Tuning } from '../types';
import { hasStandardIntervals } from '../chords/index';
import type { CagedForm } from '../chords/voicing';

export interface PositionOptions {
  tuning?: Tuning;
  /** Highest fret drawn. Default 15 (the acoustic profile). */
  maxFret?: number;
}

/** What to lay out: a tonic, a formula, and which third it has. */
export interface ToneSet {
  root: PitchClass;
  degrees: readonly string[];
  third: TonicKind;
}

const WINDOWS: Record<TonicKind, [CagedForm, number, number][]> = {
  major: [
    ['E', -1, 2],
    ['D', 1, 5],
    ['C', 4, 7],
    ['A', 6, 10],
    ['G', 8, 12],
  ],
  minor: [
    ['E', -1, 3],
    ['D', 2, 5],
    ['C', 4, 8],
    ['A', 7, 10],
    ['G', 9, 13],
  ],
};

function context(tones: ToneSet) {
  return { root: tonicSpelling(tones.root, tones.third), degrees: tones.degrees };
}

function tonePositions(tones: ToneSet, tuning: Tuning, lo: number, hi: number): Position[] {
  const pcs = new Set(tones.degrees.map((d) => degreePc(tones.root, d)));
  const out: Position[] = [];
  for (let string = tuning.strings.length; string >= 1; string--) {
    for (let fret = Math.max(lo, 0); fret <= hi; fret++) {
      if (pcs.has(pcAt(tuning, { string, fret }))) out.push({ string, fret });
    }
  }
  return out;
}

/** Every tone on the whole neck. */
export function fullNeckMarks(tones: ToneSet, options: PositionOptions = {}): Mark[] {
  const tuning = options.tuning ?? STANDARD_TUNING;
  return makeMarks(tuning, context(tones), tonePositions(tones, tuning, 0, options.maxFret ?? 15));
}

export interface CagedPosition {
  form: CagedForm;
  /** Group id used on marks: the form letter, with a suffix for a repeat an octave up ("E", "E+12"). */
  id: string;
  window: [number, number];
  marks: Mark[];
}

/**
 * The CAGED positions that fit on the neck, nearest the nut first. On a long neck a form can
 * appear twice, an octave apart. Empty for tunings that do not have standard intervals.
 */
export function cagedPositions(tones: ToneSet, options: PositionOptions = {}): CagedPosition[] {
  const tuning = options.tuning ?? STANDARD_TUNING;
  const maxFret = options.maxFret ?? 15;
  if (!hasStandardIntervals(tuning)) return [];
  const r6 = lowestFretOfPc(tuning, tuning.strings.length, tones.root);
  const out: CagedPosition[] = [];
  for (const [form, a, b] of WINDOWS[tones.third]) {
    let lo = r6 + a;
    let hi = r6 + b;
    while (lo >= 12) {
      lo -= 12;
      hi -= 12;
    }
    for (let octave = 0; lo + 2 <= maxFret; octave++, lo += 12, hi += 12) {
      const window: [number, number] = [Math.max(lo, 0), Math.min(hi, maxFret)];
      const id = octave === 0 ? form : `${form}+${12 * octave}`;
      const marks = makeMarks(
        tuning,
        context(tones),
        tonePositions(tones, tuning, window[0], window[1]).map((p) => ({ ...p, groups: [id] })),
      );
      out.push({ form, id, window, marks });
    }
  }
  return out.sort((x, y) => x.window[0] - y.window[0]);
}

/** All CAGED positions on one neck; notes shared by neighbouring positions carry both groups. */
export function cagedShape(
  tones: ToneSet,
  meta: { id: string; kind: Shape['kind']; title: string },
  options: PositionOptions = {},
): Shape {
  const positions = cagedPositions(tones, options);
  const marks =
    positions.length > 0
      ? mergeMarks(positions.flatMap((p) => p.marks))
      : fullNeckMarks(tones, options);
  return makeShape({
    ...meta,
    root: tones.root,
    marks,
    groups: positions.map((p) => ({ id: p.id, label: `${p.form} shape` })),
  });
}

export interface NpsPosition {
  /** 1–7: the scale degree the position starts on. */
  index: number;
  id: string;
  marks: Mark[];
}

/**
 * Three-notes-per-string positions of a seven-note scale: position k starts on the k-th scale
 * tone on the lowest string and climbs three notes per string.
 */
export function threeNpsPositions(tones: ToneSet, options: PositionOptions = {}): NpsPosition[] {
  const tuning = options.tuning ?? STANDARD_TUNING;
  const maxFret = options.maxFret ?? 15;
  if (tones.degrees.length !== 7) return [];
  const strings = tuning.strings.length;
  // Scale steps in semitones above the tonic, ascending.
  const steps = tones.degrees
    .map((d) => mod(degreePc(tones.root, d) - tones.root, 12))
    .sort((x, y) => x - y);
  const out: NpsPosition[] = [];
  for (let k = 0; k < 7; k++) {
    const startPc = mod(tones.root + (steps[k] ?? 0), 12);
    let midi = openMidi(tuning, strings) + lowestFretOfPc(tuning, strings, startPc);
    const positions: Position[] = [];
    let degreeIndex = k;
    for (let string = strings; string >= 1; string--) {
      for (let n = 0; n < 3; n++) {
        positions.push({ string, fret: midi - openMidi(tuning, string) });
        const here = steps[degreeIndex % 7] ?? 0;
        const next = steps[(degreeIndex + 1) % 7] ?? 0;
        midi += mod(next - here, 12);
        degreeIndex++;
      }
    }
    const lowest = Math.min(...positions.map((p) => p.fret));
    const shifted = lowest < 0 ? positions.map((p) => ({ ...p, fret: p.fret + 12 })) : positions;
    if (Math.max(...shifted.map((p) => p.fret)) > maxFret) continue;
    const id = `nps${k + 1}`;
    out.push({
      index: k + 1,
      id,
      marks: makeMarks(
        tuning,
        context(tones),
        shifted.map((p) => ({ ...p, groups: [id] })),
      ),
    });
  }
  return out.sort(
    (x, y) => Math.min(...x.marks.map((m) => m.fret)) - Math.min(...y.marks.map((m) => m.fret)),
  );
}

export const tonicName = (tones: ToneSet): string =>
  noteName(tonicSpelling(tones.root, tones.third));
