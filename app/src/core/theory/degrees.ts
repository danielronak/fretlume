/** Scale/chord degrees ("1", "b3", "#4", "bb7", "9") and spelling notes from them. */
import { mod, noteName, pcName, spelledPc, type SpelledNote } from './pitch';
import type { PitchClass } from './types';

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;

export interface ParsedDegree {
  /** 1-based scale-step number (1–13). */
  number: number;
  /** −2…+2. */
  accidental: number;
}

export function parseDegree(degree: string): ParsedDegree {
  const match = /^(b{1,2}|#{1,2})?(\d{1,2})$/.exec(degree);
  if (!match?.[2]) throw new Error(`invalid degree "${degree}"`);
  const marks = match[1] ?? '';
  const number = Number(match[2]);
  if (number < 1 || number > 14) throw new Error(`invalid degree "${degree}"`);
  return { number, accidental: marks.startsWith('#') ? marks.length : -marks.length };
}

/** Semitones above the root; 9, 11, 13 are an octave above 2, 4, 6. */
export function degreeSemitones(degree: string): number {
  const { number, accidental } = parseDegree(degree);
  const step = MAJOR_STEPS[(number - 1) % 7] ?? 0;
  return step + 12 * Math.floor((number - 1) / 7) + accidental;
}

export function degreePc(root: PitchClass, degree: string): PitchClass {
  return mod(root + degreeSemitones(degree), 12);
}

/**
 * Spell the note a degree above a spelled root, keeping letter names in order
 * (the third of A is some kind of C, never D-flat).
 */
export function spellDegree(root: SpelledNote, degree: string): string {
  const { number } = parseDegree(degree);
  const letter = mod(root.letter + (number - 1), 7);
  const target = mod(spelledPc(root) + degreeSemitones(degree), 12);
  const natural = spelledPc({ letter, accidental: 0 });
  let accidental = mod(target - natural, 12);
  if (accidental > 6) accidental -= 12;
  // Triple accidentals are unreadable; fall back to a plain name.
  if (Math.abs(accidental) > 2) return pcName(target, root.accidental < 0 ? 'flat' : 'sharp');
  return noteName({ letter, accidental });
}

/** Degree label for an interval in semitones, choosing the label a formula does not already define. */
const DEFAULT_DEGREE = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'] as const;

export function defaultDegree(semitones: number): string {
  return DEFAULT_DEGREE[mod(semitones, 12)] ?? '1';
}

/** Map pitch class (relative to root) → degree label, for a formula such as ['1','b3','5']. */
export function degreeLookup(degrees: readonly string[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const degree of degrees) {
    const semis = mod(degreeSemitones(degree), 12);
    if (!map.has(semis)) map.set(semis, degree);
  }
  return map;
}
