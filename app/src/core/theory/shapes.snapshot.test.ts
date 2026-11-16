/**
 * Snapshots of the mark lists for representative shapes (phase 1 task 1.9).
 * The flat diagram and the camera overlay both draw exactly these marks, so any change to
 * theory output shows up here as a readable diff.
 */
import { describe, expect, it } from 'vitest';
import { cagedChordShape, chordVoicings, voicingToShape } from './chords/index';
import { arpeggioShape, intervalShape, noteFinderShape } from './extras';
import { scalePositionShape, scaleShape } from './scales/index';
import { describeShape } from './shape';
import { triadShape } from './triads';
import type { Shape } from './types';

/** Compact, human-readable form: "5:3 C 1 f3 root [C]". */
const compact = (shape: Shape) => ({
  title: shape.title,
  window: shape.window.join('-'),
  muted: shape.muted.join(','),
  groups: shape.groups.map((g) => g.id).join(','),
  marks: shape.marks.map(
    (m) =>
      `${m.string}:${m.fret} ${m.note} ${m.degree}${m.finger ? ` f${m.finger}` : ''} ${m.role}` +
      (m.groups.length ? ` [${m.groups.join('+')}]` : ''),
  ),
});

const firstVoicing = (root: number, quality: string) =>
  voicingToShape(root, quality, chordVoicings(root, quality)[0]!);

const SHAPES: [string, () => Shape][] = [
  ['C major open chord', () => firstVoicing(0, 'maj')],
  ['G major open chord', () => firstVoicing(7, 'maj')],
  ['D major open chord', () => firstVoicing(2, 'maj')],
  ['A minor open chord', () => firstVoicing(9, 'min')],
  ['E minor open chord', () => firstVoicing(4, 'min')],
  ['F major barre chord', () => firstVoicing(5, 'maj')],
  ['B minor barre chord', () => firstVoicing(11, 'min')],
  ['B7', () => firstVoicing(11, '7')],
  ['C major seventh', () => firstVoicing(0, 'maj7')],
  ['D minor seventh', () => firstVoicing(2, 'm7')],
  ['Bb major (A-shape barre)', () => firstVoicing(10, 'maj')],
  ['F# half-diminished', () => firstVoicing(6, 'm7b5')],
  ['E7#9', () => firstVoicing(4, '7#9')],
  ['C major, five CAGED chord shapes', () => cagedChordShape(0, 'maj')],
  ['A minor, five CAGED chord shapes', () => cagedChordShape(9, 'min')],
  ['A minor pentatonic, E shape', () => scalePositionShape(9, 'minor-pentatonic', 'E')!],
  ['G major, E shape', () => scalePositionShape(7, 'major', 'E')!],
  ['C major, C shape (open position)', () => scalePositionShape(0, 'major', 'C')!],
  [
    'E minor pentatonic, E shape (open position)',
    () => scalePositionShape(4, 'minor-pentatonic', 'E')!,
  ],
  ['A major, all CAGED positions', () => scaleShape(9, 'major', 'caged')],
  ['E blues, all CAGED positions', () => scaleShape(4, 'blues', 'caged')],
  ['A harmonic minor, all CAGED positions', () => scaleShape(9, 'harmonic-minor', 'caged')],
  ['G major, three notes per string', () => scaleShape(7, 'major', 'nps', { maxFret: 22 })],
  ['D Dorian, whole neck to fret 12', () => scaleShape(2, 'dorian', 'neck', { maxFret: 12 })],
  ['C major triads on strings 321', () => triadShape(0, 'maj', '321')],
  ['A minor triads on strings 543', () => triadShape(9, 'min', '543')],
  ['B diminished triads on strings 432', () => triadShape(11, 'dim', '432')],
  ['C major seventh arpeggio', () => arpeggioShape(0, 'maj7')],
  ['Octave above G (string 6 fret 3)', () => intervalShape({ string: 6, fret: 3 }, 12)],
  ['Every C on the neck', () => noteFinderShape(0)],
];

describe('shape snapshots', () => {
  it('covers 30 representative shapes', () => {
    expect(SHAPES).toHaveLength(30);
  });

  it.each(SHAPES)('%s', (_name, build) => {
    expect(compact(build())).toMatchSnapshot();
  });

  it('describes shapes for screen readers', () => {
    expect(describeShape(firstVoicing(0, 'maj'))).toBe(
      'C major: string 5 fret 3 C, string 4 fret 2 E, string 3 open G, string 2 fret 1 C, string 1 open E; muted strings 6',
    );
  });
});
