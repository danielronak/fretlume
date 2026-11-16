/** Close-voiced triads on three adjacent strings, in every inversion (docs/specs/03 §4). */
import { degreePc } from './degrees';
import { mod, noteName, tonicSpelling } from './pitch';
import { makeMarks, makeShape } from './shape';
import { openMidi, STANDARD_TUNING } from './tuning';
import type { Mark, PitchClass, Position, Shape, Tuning } from './types';

export const TRIAD_QUALITIES = {
  maj: { name: 'major', degrees: ['1', '3', '5'], third: 'major' },
  min: { name: 'minor', degrees: ['1', 'b3', '5'], third: 'minor' },
  dim: { name: 'diminished', degrees: ['1', 'b3', 'b5'], third: 'minor' },
  aug: { name: 'augmented', degrees: ['1', '3', '#5'], third: 'major' },
} as const;

export type TriadQuality = keyof typeof TRIAD_QUALITIES;
export type Inversion = 'root' | '1st' | '2nd';
export const INVERSIONS: Inversion[] = ['root', '1st', '2nd'];
export const INVERSION_LABEL: Record<Inversion, string> = {
  root: 'Root position',
  '1st': '1st inversion',
  '2nd': '2nd inversion',
};

/** "654", "543", "432", "321": the three adjacent strings, lowest first. */
export type StringSet = '654' | '543' | '432' | '321';
export const STRING_SETS: StringSet[] = ['654', '543', '432', '321'];

export interface TriadVoicing {
  inversion: Inversion;
  /** Lowest string first. */
  positions: [Position, Position, Position];
}

export interface TriadOptions {
  tuning?: Tuning;
  maxFret?: number;
}

/** Every close-voiced triad on a string set, nearest the nut first. */
export function triadVoicings(
  root: PitchClass,
  quality: TriadQuality,
  stringSet: StringSet,
  options: TriadOptions = {},
): TriadVoicing[] {
  const tuning = options.tuning ?? STANDARD_TUNING;
  const maxFret = options.maxFret ?? 15;
  const strings = stringSet.split('').map(Number) as [number, number, number];
  const tones = TRIAD_QUALITIES[quality].degrees.map((d) => degreePc(root, d));
  const out: TriadVoicing[] = [];

  INVERSIONS.forEach((inversion, bassIndex) => {
    const order = [0, 1, 2].map((i) => tones[(bassIndex + i) % 3] ?? 0);
    const bassOpen = openMidi(tuning, strings[0]);
    for (let fret = mod((order[0] ?? 0) - bassOpen, 12); fret <= maxFret; fret += 12) {
      const low = bassOpen + fret;
      const middle = low + mod((order[1] ?? 0) - (order[0] ?? 0), 12);
      const high = middle + mod((order[2] ?? 0) - (order[1] ?? 0), 12);
      const positions: [Position, Position, Position] = [
        { string: strings[0], fret },
        { string: strings[1], fret: middle - openMidi(tuning, strings[1]) },
        { string: strings[2], fret: high - openMidi(tuning, strings[2]) },
      ];
      const frets = positions.map((p) => p.fret);
      if (Math.min(...frets) < 0 || Math.max(...frets) > maxFret) continue;
      out.push({ inversion, positions });
    }
  });

  return out.sort(
    (a, b) =>
      Math.max(...a.positions.map((p) => p.fret)) - Math.max(...b.positions.map((p) => p.fret)) ||
      a.positions[0].fret - b.positions[0].fret,
  );
}

export function triadName(root: PitchClass, quality: TriadQuality): string {
  const def = TRIAD_QUALITIES[quality];
  return `${noteName(tonicSpelling(root, def.third))} ${def.name} triads`;
}

/** All triads of one string set on the neck, grouped (and coloured) by inversion. */
export function triadShape(
  root: PitchClass,
  quality: TriadQuality,
  stringSet: StringSet,
  options: TriadOptions = {},
): Shape {
  const tuning = options.tuning ?? STANDARD_TUNING;
  const def = TRIAD_QUALITIES[quality];
  const context = { root: tonicSpelling(root, def.third), degrees: def.degrees };
  const marks: Mark[] = triadVoicings(root, quality, stringSet, options).flatMap((voicing) =>
    makeMarks(
      tuning,
      context,
      voicing.positions.map((p) => ({ ...p, groups: [voicing.inversion] })),
    ),
  );
  return makeShape({
    id: `triad:${root}:${quality}:${stringSet}`,
    kind: 'triad',
    title: triadName(root, quality),
    root,
    marks,
    groups: INVERSIONS.map((id) => ({ id, label: INVERSION_LABEL[id] })),
  });
}
