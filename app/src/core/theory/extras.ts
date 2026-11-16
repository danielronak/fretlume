/** Arpeggios, intervals and the note finder. */
import { chordName, chordQuality } from './chords/index';
import { mod, noteName, pcOf, tonicSpelling } from './pitch';
import { cagedShape, type PositionOptions } from './scales/positions';
import { makeMarks, makeShape } from './shape';
import { midiAt, positionsOfPc, STANDARD_TUNING } from './tuning';
import type { PitchClass, Position, Shape, Tuning } from './types';

/** Chord tones laid out in the CAGED positions. */
export function arpeggioShape(
  root: PitchClass,
  qualityId: string,
  options: PositionOptions = {},
): Shape {
  const quality = chordQuality(qualityId);
  const third = quality.third === 'minor' ? 'minor' : 'major';
  // Extensions fold into one octave for arpeggio practice.
  return cagedShape(
    { root, degrees: quality.degrees, third },
    {
      id: `arpeggio:${root}:${qualityId}`,
      kind: 'arpeggio',
      title: `${chordName(root, quality)} arpeggio`,
    },
    options,
  );
}

export const INTERVALS = [
  { semitones: 1, id: 'm2', name: 'minor second', degree: 'b2' },
  { semitones: 2, id: 'M2', name: 'major second', degree: '2' },
  { semitones: 3, id: 'm3', name: 'minor third', degree: 'b3' },
  { semitones: 4, id: 'M3', name: 'major third', degree: '3' },
  { semitones: 5, id: 'P4', name: 'perfect fourth', degree: '4' },
  { semitones: 6, id: 'TT', name: 'tritone', degree: 'b5' },
  { semitones: 7, id: 'P5', name: 'perfect fifth', degree: '5' },
  { semitones: 8, id: 'm6', name: 'minor sixth', degree: 'b6' },
  { semitones: 9, id: 'M6', name: 'major sixth', degree: '6' },
  { semitones: 10, id: 'm7', name: 'minor seventh', degree: 'b7' },
  { semitones: 11, id: 'M7', name: 'major seventh', degree: '7' },
  { semitones: 12, id: 'P8', name: 'octave', degree: '1' },
] as const;

/**
 * Where an interval above a root note can be reached: every position of the target pitch
 * within `reach` frets of the root (the shapes guitarists memorise, such as the octave
 * two strings up and two frets over).
 */
export function intervalShape(
  rootPosition: Position,
  semitones: number,
  options: { tuning?: Tuning; maxFret?: number; reach?: number } = {},
): Shape {
  const tuning = options.tuning ?? STANDARD_TUNING;
  const maxFret = options.maxFret ?? 15;
  const reach = options.reach ?? 4;
  const rootMidi = midiAt(tuning, rootPosition);
  const rootPc = pcOf(rootMidi);
  const target = rootMidi + semitones;
  const interval = INTERVALS.find((i) => i.semitones === mod(semitones - 1, 12) + 1);
  const targets: Position[] = [];
  for (let string = 1; string <= tuning.strings.length; string++) {
    const fret = target - midiAt(tuning, { string, fret: 0 });
    if (fret < 0 || fret > maxFret) continue;
    if (Math.abs(fret - rootPosition.fret) > reach) continue;
    if (string === rootPosition.string && fret === rootPosition.fret) continue;
    targets.push({ string, fret });
  }
  const spelledRoot = tonicSpelling(rootPc, 'major');
  const marks = makeMarks(tuning, { root: spelledRoot, degrees: ['1', interval?.degree ?? '1'] }, [
    rootPosition,
    ...targets,
  ]);
  return makeShape({
    id: `interval:${rootPosition.string}:${rootPosition.fret}:${semitones}`,
    kind: 'interval',
    title: `${interval?.name ?? 'interval'} above ${noteName(spelledRoot)}`,
    root: rootPc,
    marks,
  });
}

/** Every place a note lives on the neck. */
export function noteFinderShape(
  pc: PitchClass,
  options: { tuning?: Tuning; maxFret?: number } = {},
): Shape {
  const tuning = options.tuning ?? STANDARD_TUNING;
  const spelled = tonicSpelling(pc, 'major');
  return makeShape({
    id: `notes:${pc}`,
    kind: 'notes',
    title: `Every ${noteName(spelled)} on the neck`,
    root: pc,
    marks: makeMarks(
      tuning,
      { root: spelled, degrees: ['1'] },
      positionsOfPc(tuning, pc, options.maxFret ?? 15),
    ),
  });
}
