/** Pitch classes, note spelling and MIDI helpers. Pure functions. */
import type { Midi, PitchClass } from './types';

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11] as const;

/** A note name as written: a letter plus accidentals (−1 = flat, +1 = sharp). */
export interface SpelledNote {
  /** 0 = C … 6 = B. */
  letter: number;
  accidental: number;
}

export const mod = (n: number, m: number): number => ((n % m) + m) % m;

export const pcOf = (midi: Midi): PitchClass => mod(midi, 12);

export function spelledPc(note: SpelledNote): PitchClass {
  return mod((LETTER_PC[note.letter] ?? 0) + note.accidental, 12);
}

export function noteName(note: SpelledNote): string {
  const letter = LETTERS[note.letter] ?? 'C';
  const mark = note.accidental >= 0 ? '#' : 'b';
  return letter + mark.repeat(Math.abs(note.accidental));
}

/** Parse "C", "F#", "Bb", "Ebb". Returns null for anything else. */
export function parseNote(text: string): SpelledNote | null {
  const match = /^([A-Ga-g])(#{1,2}|b{1,2})?$/.exec(text.trim());
  if (!match?.[1]) return null;
  const letter = LETTERS.indexOf(match[1].toUpperCase() as (typeof LETTERS)[number]);
  const marks = match[2] ?? '';
  const accidental = marks.startsWith('#') ? marks.length : -marks.length;
  return { letter, accidental };
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export type AccidentalPreference = 'sharp' | 'flat';

/** Name of a pitch class with no key context. */
export function pcName(pc: PitchClass, prefer: AccidentalPreference = 'sharp'): string {
  const names = prefer === 'sharp' ? SHARP_NAMES : FLAT_NAMES;
  return names[mod(pc, 12)] ?? 'C';
}

/** "C#/Db" style label for root pickers. */
export function pcPairName(pc: PitchClass): string {
  const sharp = pcName(pc, 'sharp');
  const flat = pcName(pc, 'flat');
  return sharp === flat ? sharp : `${sharp}/${flat}`;
}

// Common-practice tonic spellings: the key with fewer accidentals wins (Db major over C# major,
// C# minor over Db minor); F#/Gb major and Eb/D# minor are ties resolved the usual guitar way.
const MAJOR_TONICS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const MINOR_TONICS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'] as const;

export type TonicKind = 'major' | 'minor';

/** How a tonic of this pitch class is normally written for major-type or minor-type material. */
export function tonicSpelling(pc: PitchClass, kind: TonicKind = 'major'): SpelledNote {
  const table = kind === 'major' ? MAJOR_TONICS : MINOR_TONICS;
  const parsed = parseNote(table[mod(pc, 12)] ?? 'C');
  if (!parsed) throw new Error(`no tonic spelling for pitch class ${pc}`);
  return parsed;
}

/** Octave-numbered name, middle C (60) = "C4". */
export function midiName(midi: Midi, prefer: AccidentalPreference = 'sharp'): string {
  return `${pcName(pcOf(midi), prefer)}${Math.floor(midi / 12) - 1}`;
}

/** Equal-temperament frequency. */
export function midiToHz(midi: Midi, a4Hz = 440): number {
  return a4Hz * 2 ** ((midi - 69) / 12);
}

/** Fractional MIDI number of a frequency. */
export function hzToMidi(fHz: number, a4Hz = 440): number {
  return 69 + 12 * Math.log2(fHz / a4Hz);
}

/** Signed distance in cents from `fHz` to the nearest equal-tempered note. */
export function centsOff(fHz: number, a4Hz = 440): { midi: Midi; cents: number } {
  const exact = hzToMidi(fHz, a4Hz);
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100 };
}

export function transposePc(pc: PitchClass, semitones: number): PitchClass {
  return mod(pc + semitones, 12);
}
