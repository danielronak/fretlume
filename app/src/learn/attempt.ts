/** Attempt events (docs/specs/04-learning.md §5): what was asked, what was heard, how it went. Pure. */
import type { NoteCheck, Verdict } from '@audio/analysis/verify';

export interface AttemptEvent {
  tMs: number;
  sessionId: string;
  stepId: string;
  skillIds: string[];
  /** What was asked: a library item or tab position and its notes. */
  target: { label: string; notes: { string: number; fret: number; midi: number }[] };
  verdict: 'correct' | 'wrong' | 'escaped';
  /** Per string: present / unsure / weak / missing / wrong (+ heard MIDI). */
  perNote: { string: number; state: string; heard?: number }[];
  timingMs?: number;
  latencyMs: number;
  scaffold: 'full' | 'outline' | 'hint-on-hesitation' | 'none';
  usedHint: boolean;
  source: 'audio' | 'audio+vision' | 'self-report';
}

export function attemptFromChord(
  base: Omit<AttemptEvent, 'verdict' | 'perNote' | 'source'>,
  v: Verdict,
): AttemptEvent {
  return {
    ...base,
    verdict: v.ok ? 'correct' : 'wrong',
    perNote: v.perNote.map((n) => ({
      string: n.string,
      state: n.state,
      ...(n.heard !== undefined ? { heard: n.heard } : {}),
    })),
    source: 'audio',
  };
}

export function attemptFromNote(
  base: Omit<AttemptEvent, 'verdict' | 'perNote' | 'source'>,
  check: NoteCheck,
  string: number,
): AttemptEvent {
  return {
    ...base,
    verdict: check.ok ? 'correct' : 'wrong',
    perNote: [
      { string, state: check.state, ...(check.heard !== undefined ? { heard: check.heard } : {}) },
    ],
    source: 'audio',
  };
}
