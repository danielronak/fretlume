/**
 * Fingering inference: which finger plays each note of a voicing
 * (docs/specs/03-theory-content.md §2). Returns null when the shape cannot be held.
 */
import type { Finger } from '../types';
import type { Barre } from './voicing';

export interface Fingering {
  fingers: Finger[];
  barre?: Barre;
}

interface Note {
  string: number;
  fret: number;
}

/** Fret ascending, then lowest-pitched string first: the order fingers naturally fall in. */
const byFretThenString = (a: Note, b: Note) => a.fret - b.fret || b.string - a.string;

/**
 * Give each note the lowest finger that is free and reaches its fret
 * (a note `offset` frets above the lowest needs at least finger `offset + 1`).
 * Falls back to plain 1-2-3-4 order when that overflows. If there are still more notes than
 * fingers, neighbouring strings at the same fret share a finger (a small second barre, as the
 * ring finger does in the A-shape barre chord). Returns null when nothing fits.
 */
function assign(notes: Note[], minFret: number, firstFinger: number): Map<Note, number> | null {
  const ordered = [...notes].sort(byFretThenString);
  const natural = new Map<Note, number>();
  let previous = firstFinger - 1;
  for (const note of ordered) {
    const finger = Math.max(previous + 1, note.fret - minFret + 1);
    natural.set(note, finger);
    previous = finger;
  }
  if (previous <= 4) return natural;

  const available = 4 - (firstFinger - 1);
  const units: Note[][] = ordered.map((note) => [note]);
  while (units.length > available) {
    // Merge the highest-fret pair of neighbouring strings that share a fret.
    let merged = false;
    for (let i = units.length - 1; i > 0 && !merged; i--) {
      const a = units[i - 1];
      const b = units[i];
      if (!a || !b) continue;
      const last = a[a.length - 1];
      const first = b[0];
      if (last && first && last.fret === first.fret && last.string - first.string === 1) {
        units.splice(i - 1, 2, [...a, ...b]);
        merged = true;
      }
    }
    if (!merged) return null;
  }
  const compact = new Map<Note, number>();
  units.forEach((unit, index) => unit.forEach((note) => compact.set(note, firstFinger + index)));
  return compact;
}

export function inferFingering(frets: readonly number[]): Fingering | null {
  const fingers: Finger[] = frets.map(() => 0);
  const fretted: Note[] = frets.flatMap((fret, index) =>
    fret > 0 ? [{ string: index + 1, fret }] : [],
  );
  if (fretted.length === 0) return { fingers };

  const minFret = Math.min(...fretted.map((n) => n.fret));
  const atMin = fretted.filter((n) => n.fret === minFret);
  const rest = fretted.filter((n) => n.fret !== minFret);

  // A barre: the index finger lies across from its lowest-pitched note to string 1,
  // so no string under it may be open.
  const barreFrom = Math.max(...atMin.map((n) => n.string));
  const barreTo = Math.min(...atMin.map((n) => n.string));
  const openUnderBarre = frets.some((fret, index) => index + 1 <= barreFrom && fret === 0);
  const contiguous = atMin.length === barreFrom - barreTo + 1;
  const barrePossible = atMin.length >= 2 && !openUnderBarre;
  // Wanted when the notes at the lowest fret are neighbours, or when four or more notes are fretted
  // (the classic barre-chord layout, where other fingers play between the barred strings).
  const barreWanted = fretted.length >= 4 || contiguous;

  if (barrePossible && barreWanted) {
    const assigned = assign(rest, minFret, 2);
    if (assigned) {
      for (const note of atMin) fingers[note.string - 1] = 1;
      for (const [note, finger] of assigned) fingers[note.string - 1] = finger as Finger;
      return { fingers, barre: { fret: minFret, fromString: barreFrom, toString: barreTo } };
    }
  }

  // No barre. With only one or two fretted notes in open position, fingers follow the frets
  // (E minor is played with fingers 2 and 3, not 1 and 2).
  const openPosition = frets.includes(0) && Math.max(...fretted.map((n) => n.fret)) <= 4;
  const firstFinger = openPosition && fretted.length <= 2 ? Math.min(minFret, 3) : 1;
  const assigned = assign(fretted, minFret, firstFinger);
  if (!assigned) return null;
  for (const [note, finger] of assigned) fingers[note.string - 1] = finger as Finger;
  return { fingers };
}
