/** What the listener should expect from the shape on the deck (phase 6 task 6.6). Pure. */
import type { Expectation } from '@audio/listener/core';
import type { Shape } from '@core/theory/types';

/**
 * A chord when the shown marks have at most one per string (a voicing, a triad, a double stop), a
 * single note for one mark; null for scales and multi-position views (nothing single to check).
 */
export function expectationFromShape(
  shape: Shape,
  activeGroups: readonly string[],
  tuning: readonly number[],
  id: string,
  a4Hz: number,
): Expectation | null {
  const marks = shape.marks.filter(
    (m) =>
      m.role !== 'ghost' &&
      (!activeGroups.length || m.groups.some((g) => activeGroups.includes(g))),
  );
  if (marks.length === 0 || marks.length > 6) return null;
  const strings = new Set(marks.map((m) => m.string));
  if (strings.size !== marks.length) return null;
  const notes = marks
    .map((m) => ({ string: m.string, fret: m.fret, midi: m.midi }))
    .sort((a, b) => b.string - a.string);
  if (notes.length === 1) return { id, kind: 'note', notes, a4Hz };
  const muted = shape.muted.map((s) => ({ string: s, midi: tuning[s - 1]! }));
  return { id, kind: 'chord', notes, muted, a4Hz };
}
