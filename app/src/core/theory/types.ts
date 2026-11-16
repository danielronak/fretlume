/**
 * Shared types of the theory engine (docs/specs/03-theory-content.md §1).
 * Conventions: strings are numbered 1 (high e) … N (low E); array index = string − 1.
 * Frets are absolute from the nut, 0 = open. Pitches are MIDI numbers (E2 = 40).
 */

/** 0 = C … 11 = B. */
export type PitchClass = number;
export type Midi = number;

export interface Tuning {
  id: string;
  name: string;
  /** Open-string pitches; index 0 = string 1 (highest). */
  strings: Midi[];
}

export interface Position {
  /** 1 = highest string. */
  string: number;
  /** 0 = open. */
  fret: number;
}

/** 0 = open (no finger), 1–4 = index…pinky, 'T' = thumb. */
export type Finger = 0 | 1 | 2 | 3 | 4 | 'T';

export type MarkRole = 'root' | 'tone' | 'ghost' | 'open';

export interface Mark extends Position {
  midi: Midi;
  pc: PitchClass;
  /** Spelled note name in the shape's context, e.g. "C#" or "Db". */
  note: string;
  /** Scale/chord degree relative to the shape's root: '1', 'b3', '#4' … */
  degree?: string;
  finger?: Finger;
  role: MarkRole;
  /**
   * Groups this mark belongs to — CAGED shape letters, inversion ids or position ids.
   * A note shared by two overlapping positions carries both (drawn as a split-colour dot).
   */
  groups: string[];
}

export type ShapeKind = 'chord' | 'scale' | 'triad' | 'arpeggio' | 'interval' | 'notes';

export interface ShapeGroup {
  id: string;
  label: string;
}

export interface Shape {
  id: string;
  kind: ShapeKind;
  title: string;
  /** Pitch class of the root/tonic, when the shape has one. */
  root?: PitchClass;
  marks: Mark[];
  /** Strings (1-based) that must not sound, for chord voicings. */
  muted: number[];
  /** Lowest and highest fretted fret used (open strings excluded); [0, 0] if all open. */
  window: [number, number];
  /** Groups present in `marks`, in display order. */
  groups: ShapeGroup[];
}
