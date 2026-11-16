/** Building `Shape`s — the one mark model that both the flat diagram and the camera overlay draw. */
import { defaultDegree, degreeLookup, spellDegree } from './degrees';
import { mod, pcOf, type SpelledNote, spelledPc } from './pitch';
import { midiAt } from './tuning';
import type { Finger, Mark, Position, Shape, ShapeGroup, ShapeKind, Tuning } from './types';

/** Names notes and degrees relative to a spelled root and a formula such as ['1','b3','5']. */
export interface SpellingContext {
  root: SpelledNote;
  degrees: readonly string[];
}

export interface MarkInput extends Position {
  finger?: Finger;
  groups?: string[];
  ghost?: boolean;
}

export function makeMarks(tuning: Tuning, context: SpellingContext, inputs: MarkInput[]): Mark[] {
  const rootPc = spelledPc(context.root);
  const lookup = degreeLookup(context.degrees);
  return inputs.map((input) => {
    const midi = midiAt(tuning, input);
    const pc = pcOf(midi);
    const relative = mod(pc - rootPc, 12);
    const degree = lookup.get(relative) ?? defaultDegree(relative);
    const mark: Mark = {
      string: input.string,
      fret: input.fret,
      midi,
      pc,
      note: spellDegree(context.root, degree),
      degree,
      role: input.ghost ? 'ghost' : relative === 0 ? 'root' : input.fret === 0 ? 'open' : 'tone',
      groups: input.groups ?? [],
    };
    if (input.finger !== undefined) mark.finger = input.finger;
    return mark;
  });
}

/** Merge marks at the same position, uniting their groups (overlapping positions share notes). */
export function mergeMarks(marks: Mark[]): Mark[] {
  const byPosition = new Map<string, Mark>();
  for (const mark of marks) {
    const key = `${mark.string}:${mark.fret}`;
    const existing = byPosition.get(key);
    if (!existing) {
      byPosition.set(key, { ...mark, groups: [...mark.groups] });
      continue;
    }
    for (const group of mark.groups)
      if (!existing.groups.includes(group)) existing.groups.push(group);
    if (existing.role === 'ghost' && mark.role !== 'ghost') existing.role = mark.role;
  }
  return sortMarks([...byPosition.values()]);
}

/** Low string first, then nut to bridge — a stable order for snapshots and screen readers. */
export function sortMarks(marks: Mark[]): Mark[] {
  return [...marks].sort((a, b) => b.string - a.string || a.fret - b.fret);
}

export function fretWindow(marks: Position[]): [number, number] {
  const fretted = marks.filter((m) => m.fret > 0).map((m) => m.fret);
  if (fretted.length === 0) return [0, 0];
  return [Math.min(...fretted), Math.max(...fretted)];
}

export function makeShape(input: {
  id: string;
  kind: ShapeKind;
  title: string;
  root?: number;
  marks: Mark[];
  muted?: number[];
  groups?: ShapeGroup[];
}): Shape {
  const shape: Shape = {
    id: input.id,
    kind: input.kind,
    title: input.title,
    marks: sortMarks(input.marks),
    muted: [...(input.muted ?? [])].sort((a, b) => b - a),
    window: fretWindow(input.marks),
    groups: input.groups ?? [],
  };
  if (input.root !== undefined) shape.root = input.root;
  return shape;
}

/** Plain-language description for screen readers: "C major: string 5 fret 3 C, …". */
export function describeShape(shape: Shape): string {
  const notes = shape.marks
    .filter((m) => m.role !== 'ghost')
    .map((m) => `string ${m.string} ${m.fret === 0 ? 'open' : `fret ${m.fret}`} ${m.note}`);
  const muted = shape.muted.length ? `; muted strings ${shape.muted.join(', ')}` : '';
  return `${shape.title}: ${notes.join(', ')}${muted}`;
}
