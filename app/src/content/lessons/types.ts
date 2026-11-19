/**
 * Lesson format (docs/specs/04-learning.md §2). Phase 5 runs `explain` and `demo` sections; guided,
 * drill and check sections arrive with listening (Phase 6) and the curriculum (Phase 8).
 */
import type { MessageKey } from '@i18n/index';

export type TrackId = 'first-steps' | 'chords' | 'rhythm' | 'fretboard' | 'lead';

/**
 * A library item on the neck: its id ("chord-4-min") and either a chord voicing (0 = the first, nearest
 * the nut) or a deck entry (0 = all shapes, then one per CAGED shape or string set).
 */
export interface FigureRef {
  itemId: string;
  voicing?: number;
  entry?: number;
}

export interface DemoStep extends FigureRef {
  /** What the step says while it shows the figure. */
  textKey: MessageKey;
  /** Seconds before the next step when playing (default 6). */
  seconds?: number;
}

export type Section =
  | { kind: 'explain'; bodyKey: MessageKey; figure?: FigureRef }
  | { kind: 'demo'; steps: DemoStep[] };

export interface Lesson {
  id: string;
  track: TrackId;
  titleKey: MessageKey;
  summaryKey: MessageKey;
  minutes: number;
  sections: Section[];
}
