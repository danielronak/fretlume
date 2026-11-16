/** A chord voicing: which fret each string plays. */
import type { Finger, Position } from '../types';

export type CagedForm = 'C' | 'A' | 'G' | 'E' | 'D';
export const CAGED_FORMS: CagedForm[] = ['C', 'A', 'G', 'E', 'D'];

export interface Barre {
  fret: number;
  /** Lowest-pitched string under the barre (largest string number). */
  fromString: number;
  /** Highest-pitched string under the barre. */
  toString: number;
}

export interface Voicing {
  /** Fret per string; index 0 = string 1 (high e); −1 = muted, 0 = open. */
  frets: number[];
  /** Finger per string, same indexing; 0 for open and muted strings. */
  fingers?: Finger[];
  barre?: Barre;
  form?: CagedForm;
  source: 'seed' | 'moved' | 'generated';
}

/**
 * Parse the way guitarists write chords, low string first: "x32010" or, for frets above 9,
 * "x-10-12-12-11-10". Returns frets indexed by string − 1.
 */
export function parseFrets(text: string): number[] {
  const tokens = text.includes('-') ? text.split('-') : text.split('');
  const lowToHigh = tokens.map((token) => {
    if (token === 'x' || token === 'X') return -1;
    const fret = Number(token);
    if (!Number.isInteger(fret) || fret < 0)
      throw new Error(`invalid fret "${token}" in "${text}"`);
    return fret;
  });
  return lowToHigh.reverse();
}

/** Inverse of `parseFrets`. */
export function formatFrets(frets: readonly number[]): string {
  const lowToHigh = [...frets].reverse().map((fret) => (fret < 0 ? 'x' : String(fret)));
  return lowToHigh.some((token) => token.length > 1) ? lowToHigh.join('-') : lowToHigh.join('');
}

export function parseFingers(text: string): Finger[] {
  return text
    .split('')
    .map((token): Finger => {
      if (token === 'x' || token === 'X' || token === '0') return 0;
      if (token === 'T') return 'T';
      const finger = Number(token);
      if (finger < 1 || finger > 4 || !Number.isInteger(finger))
        throw new Error(`invalid finger "${token}" in "${text}"`);
      return finger as Finger;
    })
    .reverse();
}

export function soundingPositions(frets: readonly number[]): Position[] {
  const out: Position[] = [];
  frets.forEach((fret, index) => {
    if (fret >= 0) out.push({ string: index + 1, fret });
  });
  return out;
}

export const mutedStrings = (frets: readonly number[]): number[] =>
  frets.flatMap((fret, index) => (fret < 0 ? [index + 1] : []));

/** Move a shape up the neck: fretted and open strings rise together, muted strings stay muted. */
export function shiftFrets(frets: readonly number[], semitones: number): number[] {
  return frets.map((fret) => (fret < 0 ? -1 : fret + semitones));
}

/** Frets spanned by the fretted notes (open strings do not count). */
export function fretSpan(frets: readonly number[]): number {
  const fretted = frets.filter((fret) => fret > 0);
  return fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
}
