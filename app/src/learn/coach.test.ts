import { describe, expect, it } from 'vitest';
import type { NoteVerdict, Verdict } from '@audio/analysis/verify';
import { coachChord, coachNote, coachTiming, judgedDots } from './coach';

const note = (
  string: number,
  fret: number,
  midi: number,
  state: NoteVerdict['state'],
  heard?: number,
): NoteVerdict => ({
  string,
  fret,
  midi,
  state,
  evidence: 10,
  score: 1,
  ...(heard !== undefined ? { heard } : {}),
});
const verdict = (perNote: NoteVerdict[], ok: boolean, extra: Verdict['extra'] = []): Verdict => ({
  ok,
  perNote,
  extra,
  confidence: 1,
});

describe('coach', () => {
  it('wrong note first, named as a fret too low or high', () => {
    const v = verdict([note(5, 3, 48, 'missing'), note(4, 2, 52, 'wrong', 51)], false);
    expect(coachChord(v, { streak: 0, failsInARow: 0 })).toMatchObject({
      key: 'coachFretLow',
      params: { string: 4, heard: 'D#' },
    });
  });

  it('a missing string; after two fails in a row the string check is offered', () => {
    const v = verdict([note(3, 0, 55, 'missing'), note(2, 1, 60, 'present')], false);
    expect(coachChord(v, { streak: 0, failsInARow: 1 })).toEqual({
      key: 'coachStringMuted',
      params: { string: 3 },
      tone: 'fix',
      suggestStringCheck: false,
    });
    expect(coachChord(v, { streak: 0, failsInARow: 2 }).suggestStringCheck).toBe(true);
  });

  it('a silent string ringing; clean, close and streaks', () => {
    expect(
      coachChord(verdict([], false, [{ string: 6, midi: 40, score: 3 }]), {
        streak: 0,
        failsInARow: 0,
      }).key,
    ).toBe('coachStringRings');
    expect(
      coachChord(verdict([note(1, 0, 64, 'present')], true), { streak: 0, failsInARow: 0 }).key,
    ).toBe('coachClean');
    expect(
      coachChord(verdict([note(1, 0, 64, 'unsure')], true), { streak: 1, failsInARow: 0 }).key,
    ).toBe('coachSoundedClose');
    expect(
      coachChord(verdict([note(1, 0, 64, 'present')], true), { streak: 4, failsInARow: 0 }),
    ).toMatchObject({
      key: 'coachStreak',
      params: { n: 4 },
    });
  });

  it('single notes, timing, and dot colours', () => {
    expect(
      coachNote({ ok: false, state: 'wrong', score: 0.2, heard: 57 }, 3, { streak: 0 }),
    ).toMatchObject({
      key: 'coachHeardInstead',
      params: { heard: 'A' },
    });
    expect(coachTiming(30)).toBeNull();
    expect(coachTiming(-80)).toMatchObject({ key: 'coachEarly', params: { ms: 80 } });
    const dots = judgedDots(
      verdict([note(1, 0, 64, 'present'), note(2, 1, 60, 'missing')], false),
      2,
    );
    expect([...dots]).toEqual([
      ['1-2', 'good'],
      ['2-3', 'fix'],
    ]);
  });
});
