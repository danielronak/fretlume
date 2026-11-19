/**
 * Chord symbols as people type them ("C", "F#m7", "Bbmaj7", "C/G") and progressions ("C G Am F",
 * "Dm7 | G7 | Cmaj7"), for the playground's progression strip (phase 5 task 5.3). Pure.
 */
import { parseNote, spelledPc } from '../pitch';
import type { PitchClass } from '../types';
import { CHORD_QUALITIES } from './qualities';

export interface ParsedChord {
  root: PitchClass;
  qualityId: string;
  /** The text as typed (bass note kept). */
  symbol: string;
}

/** Suffix → quality id: the written suffix first, then aliases (case-sensitive: M ≠ m). */
const SUFFIXES: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const q of CHORD_QUALITIES) map.set(q.suffix, q.id);
  for (const q of CHORD_QUALITIES)
    for (const alias of q.aliases)
      if (!alias.includes(' ') && !map.has(alias)) map.set(alias, q.id);
  return map;
})();

export function parseChordSymbol(text: string): ParsedChord | null {
  const symbol = text.trim();
  const m = /^([A-Ga-g])([#b♯♭]?)(.*)$/.exec(symbol);
  if (!m) return null;
  const note = parseNote(`${m[1]!.toUpperCase()}${m[2]!.replace('♯', '#').replace('♭', 'b')}`);
  if (!note) return null;
  // A slash bass ("C/G") does not change the chord shown.
  const suffix = m[3]!.split('/')[0]!;
  const qualityId = SUFFIXES.get(suffix);
  if (qualityId === undefined) return null;
  return { root: spelledPc(note), qualityId, symbol };
}

export function parseProgression(text: string): { chords: ParsedChord[]; unknown: string[] } {
  const chords: ParsedChord[] = [];
  const unknown: string[] = [];
  for (const token of text.split(/[\s|,]+|\s-\s/).filter((x) => x && x !== '-')) {
    const chord = parseChordSymbol(token);
    if (chord) chords.push(chord);
    else unknown.push(token);
  }
  return { chords, unknown };
}
