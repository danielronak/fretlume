/**
 * What a practice-run card sounds like, and which dot lights up when (phase 5 task 5.2: "notes light
 * up as they play"). Chords strum from the lowest string up; scales, triads and arpeggios go up note
 * by note (each pitch once), spread over the card's time. Pure.
 */
import type { Shape } from '@core/theory/types';

export interface CardNote {
  midi: number;
  /** Seconds after the card starts. */
  offset: number;
  /** The dot to light (the mark's own string and fret). */
  string: number;
  fret: number;
}

export function cardNotes(
  shape: Pick<Shape, 'kind' | 'marks'>,
  activeGroups: readonly string[],
  durationMs: number | null,
): CardNote[] {
  const marks = shape.marks.filter(
    (m) =>
      m.role !== 'ghost' &&
      (!activeGroups.length || m.groups.some((g) => activeGroups.includes(g))),
  );
  if (marks.length === 0) return [];
  if (shape.kind === 'chord') {
    // One note per string, low to high, 35 ms apart.
    const byString = [...marks]
      .sort((a, b) => b.string - a.string || a.fret - b.fret)
      .filter((m, i, list) => i === 0 || list[i - 1]!.string !== m.string);
    return byString.map((m, i) => ({
      midi: m.midi,
      offset: i * 0.035,
      string: m.string,
      fret: m.fret,
    }));
  }
  // Each pitch once, low to high, at the lowest-fret position that plays it.
  const byPitch = new Map<number, (typeof marks)[number]>();
  for (const m of [...marks].sort((a, b) => a.fret - b.fret))
    if (!byPitch.has(m.midi)) byPitch.set(m.midi, m);
  const notes = [...byPitch.values()].sort((a, b) => a.midi - b.midi);
  // Fill most of the card's time, but never faster than 8 notes a second or slower than 2.
  const span = durationMs === null ? notes.length * 0.3 : (durationMs / 1000) * 0.85;
  const step = Math.min(0.5, Math.max(0.125, span / Math.max(1, notes.length)));
  return notes.map((m, i) => ({ midi: m.midi, offset: i * step, string: m.string, fret: m.fret }));
}
