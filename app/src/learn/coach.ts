/**
 * Feedback copy (docs/specs/04-learning.md §8): rule-based, short, specific, kind. One correction at
 * a time, most important first: wrong note > missing note > ringing silent string > timing. Returns an
 * i18n key and its parameters. Pure.
 */
import type { NoteCheck, Verdict } from '@audio/analysis/verify';
import type { MessageKey } from '@i18n/index';

export interface Coach {
  key: MessageKey;
  params?: Record<string, string | number>;
  tone: 'good' | 'fix' | 'info';
  /** Suggest the string-by-string check (an uncertain or repeated chord problem). */
  suggestStringCheck?: boolean;
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const pc = (midi: number) => NAMES[((midi % 12) + 12) % 12]!;

export function coachChord(v: Verdict, context: { streak: number; failsInARow: number }): Coach {
  const wrong = v.perNote.find((n) => n.state === 'wrong' && n.heard !== undefined);
  if (wrong) {
    const d = wrong.heard! - wrong.midi;
    return {
      key: d === -1 ? 'coachFretLow' : d === 1 ? 'coachFretHigh' : 'coachWrongNote',
      params: { string: wrong.string, heard: pc(wrong.heard!), expected: pc(wrong.midi) },
      tone: 'fix',
    };
  }
  const missing = v.perNote.find((n) => n.state === 'missing');
  if (missing)
    return {
      key: 'coachStringMuted',
      params: { string: missing.string },
      tone: 'fix',
      suggestStringCheck: context.failsInARow >= 2,
    };
  const extra = v.extra[0];
  if (extra) return { key: 'coachStringRings', params: { string: extra.string }, tone: 'fix' };
  const weak = v.perNote.find((n) => n.state === 'weak');
  if (!v.ok && weak)
    return {
      key: 'coachStringQuiet',
      params: { string: weak.string },
      tone: 'fix',
      suggestStringCheck: true,
    };
  if (v.ok && context.streak >= 3)
    return { key: 'coachStreak', params: { n: context.streak }, tone: 'good' };
  if (v.ok && v.perNote.some((n) => n.state === 'unsure' || n.state === 'weak'))
    return { key: 'coachSoundedClose', tone: 'good' };
  return v.ok
    ? { key: 'coachClean', tone: 'good' }
    : { key: 'coachTryAgain', tone: 'info', suggestStringCheck: true };
}

export function coachNote(check: NoteCheck, string: number, context: { streak: number }): Coach {
  if (check.ok)
    return context.streak >= 3
      ? { key: 'coachStreak', params: { n: context.streak }, tone: 'good' }
      : { key: 'coachClean', tone: 'good' };
  if (check.state === 'wrong' && check.heard !== undefined) {
    return { key: 'coachHeardInstead', params: { string, heard: pc(check.heard) }, tone: 'fix' };
  }
  if (check.state === 'weak') return { key: 'coachNoteQuiet', params: { string }, tone: 'fix' };
  return { key: 'coachNoteMissing', params: { string }, tone: 'info' };
}

export function coachTiming(deltaMs: number): Coach | null {
  if (Math.abs(deltaMs) <= 45) return null;
  return {
    key: deltaMs < 0 ? 'coachEarly' : 'coachLate',
    params: { ms: Math.round(Math.abs(deltaMs)) },
    tone: 'info',
  };
}

/** Dot colours after a verdict: "string-fret" → good / fix (for the pulse on the neck). */
export function judgedDots(v: Verdict, capo = 0): Map<string, 'good' | 'fix'> {
  const out = new Map<string, 'good' | 'fix'>();
  for (const n of v.perNote) {
    const key = `${n.string}-${n.fret + capo}`;
    out.set(key, n.state === 'present' || n.state === 'unsure' ? 'good' : 'fix');
  }
  return out;
}
