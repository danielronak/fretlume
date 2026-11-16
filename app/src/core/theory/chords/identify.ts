/** Reverse lookup: which chords do these notes make? */
import { degreePc } from '../degrees';
import { mod, noteName, tonicSpelling } from '../pitch';
import { midiAt, STANDARD_TUNING } from '../tuning';
import type { PitchClass, Position, Tuning } from '../types';
import { CHORD_QUALITIES, type ChordQuality } from './qualities';

export interface ChordMatch {
  root: PitchClass;
  quality: ChordQuality;
  /** Lowest note, when it is not the root (slash chord). */
  bass?: PitchClass;
  /** "C", "Am7", "C/E". */
  symbol: string;
  /** Lower is a more likely name. */
  rank: number;
}

/**
 * Name a set of fretted positions. A candidate matches when every sounding pitch class belongs
 * to the chord and all its essential tones are present. Root-position, complete and simpler
 * chords rank first.
 */
export function identifyChord(
  positions: Position[],
  tuning: Tuning = STANDARD_TUNING,
): ChordMatch[] {
  if (positions.length < 2) return [];
  const midis = positions.map((p) => midiAt(tuning, p));
  const bass = mod(Math.min(...midis), 12);
  const pcs = [...new Set(midis.map((m) => mod(m, 12)))];
  const matches: ChordMatch[] = [];

  for (const root of pcs) {
    for (const quality of CHORD_QUALITIES) {
      const tones = quality.degrees.map((d) => degreePc(root, d));
      if (pcs.some((pc) => !tones.includes(pc))) continue;
      if (quality.essential.some((d) => !pcs.includes(degreePc(root, d)))) continue;
      const missing = tones.filter((pc) => !pcs.includes(pc)).length;
      const inverted = bass !== root;
      const kind = quality.third === 'minor' ? 'minor' : 'major';
      const rootName = noteName(tonicSpelling(root, kind));
      const match: ChordMatch = {
        root,
        quality,
        symbol:
          rootName +
          quality.suffix +
          (inverted ? `/${noteName(tonicSpelling(bass, 'major'))}` : ''),
        rank: (inverted ? 10 : 0) + missing * 3 + quality.difficulty,
      };
      if (inverted) match.bass = bass;
      matches.push(match);
    }
  }
  return matches.sort((a, b) => a.rank - b.rank);
}
