/**
 * Listening in a practice screen (phase 6 tasks 6.4–6.6): turns the microphone and the listener on,
 * sends what the current step expects, turns verdicts into coach messages and coloured dots, logs
 * every attempt, and runs the string-by-string check. The screen passes `onAttempt` to its session.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteCheck, Verdict } from '@audio/analysis/verify';
import { microphone, type MicStatus } from '@audio/microphone';
import { useMicrophone } from '@audio/useMicrophone';
import type { Expectation, TimedExpectation } from '@audio/listener/core';
import { listener } from '@audio/listener/listener';
import { playNotes } from '@audio/player';
import { attemptFromChord, attemptFromNote } from '@learn/attempt';
import { coachChord, coachNote, judgedDots, type Coach } from '@learn/coach';
import { logAttempt } from '@storage/attempts';
import { diagnostics } from '@/diagnostics/recorder';

export interface StringCheck {
  /** Strings still to play, low to high; results so far. */
  queue: Expectation[];
  results: { string: number; ok: boolean; heard?: number }[];
}

export interface Listening {
  on: boolean;
  mic: MicStatus;
  coach: Coach | null;
  /** "string-fret" → good / fix, after the last verdict (for the neck). */
  dots: ReadonlyMap<string, 'good' | 'fix'>;
  level: number;
  check: StringCheck | null;
  /** This screen's attempts so far (for the end-of-run summary). */
  stats: { attempts: number; correct: number; firstTry: number; bestStreak: number };
  toggle: () => void;
  startStringCheck: () => void;
  stopStringCheck: () => void;
}

export function useListening(options: {
  expectation: Expectation | null;
  /** Timeline mode (tab play-along): expected beats with listener times; replaces `expectation`. */
  timeline?: TimedExpectation[] | null;
  sessionId: string;
  label: string;
  /** Called for every judged attempt at the current step (not during the string check), with the
   *  attempt's onset on the listener's clock (seconds). */
  onAttempt?: (ok: boolean, onsetS: number, info: { id: string; deltaMs?: number }) => void;
  capo?: number;
  a4Hz: number;
}): Listening {
  const mic = useMicrophone();
  const [on, setOn] = useState(false);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [dots, setDots] = useState<ReadonlyMap<string, 'good' | 'fix'>>(new Map());
  const [level, setLevel] = useState(0);
  const [check, setCheck] = useState<StringCheck | null>(null);
  const streak = useRef(0);
  const [stats, setStats] = useState({ attempts: 0, correct: 0, firstTry: 0, bestStreak: 0 });
  /** Attempts already made at the current step (first-try counting). */
  const tries = useRef(0);
  const fails = useRef(0);
  const latest = useRef(options);
  latest.current = options;
  const checkRef = useRef(check);
  checkRef.current = check;

  const toggle = useCallback(() => {
    if (on) {
      setOn(false);
      return;
    }
    setOn(true);
    if (microphone.getSnapshot().status !== 'running') void microphone.start();
  }, [on]);

  // Run the listener while on and the microphone runs.
  useEffect(() => {
    if (!on || mic.status !== 'running') return;
    listener.start();
    const off = listener.onCost((share) => diagnostics.cost(share));
    return () => {
      off();
      listener.stop();
    };
  }, [on, mic.status]);

  // What the listener should expect: the string check's next string, or the step.
  const expectation = check ? (check.queue[0] ?? null) : options.expectation;
  const timeline = check ? null : (options.timeline ?? null);
  const expectKey = JSON.stringify(expectation);
  const timelineKey = JSON.stringify(timeline);
  useEffect(() => {
    tries.current = 0;
    if (!on || mic.status !== 'running' || timeline) return;
    listener.expect(expectation);
    setDots(new Map());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, mic.status, expectKey, timeline === null]);
  useEffect(() => {
    if (!on || mic.status !== 'running' || !timeline) return;
    listener.expectTimeline(timeline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, mic.status, timelineKey]);

  useEffect(() => {
    if (!on) return;
    return listener.on((ev) => {
      const o = latest.current;
      if (ev.type === 'level') {
        setLevel(ev.rms);
        return;
      }
      const c = checkRef.current;
      if (ev.type === 'strumIgnored') {
        setCoach({ key: 'listenOneString', tone: 'info' });
        return;
      }
      if (c && ev.type === 'note' && ev.id === c.queue[0]?.id) {
        const string = c.queue[0]!.notes[0]!.string;
        const result = {
          string,
          ok: ev.check.ok,
          ...(ev.check.heard !== undefined ? { heard: ev.check.heard } : {}),
        };
        const next = { queue: c.queue.slice(1), results: [...c.results, result] };
        setCheck(next);
        setCoach(coachNote(ev.check, string, { streak: 0 }));
        return;
      }
      const count = (ok: boolean) => {
        setStats((st) => ({
          attempts: st.attempts + 1,
          correct: st.correct + (ok ? 1 : 0),
          firstTry: st.firstTry + (ok && tries.current === 0 ? 1 : 0),
          bestStreak: Math.max(st.bestStreak, streak.current),
        }));
        tries.current++;
      };
      const target =
        ('id' in ev && o.timeline?.find((i) => i.id === ev.id)) ||
        ('id' in ev && ev.id === o.expectation?.id ? o.expectation : null);
      const info = {
        id: 'id' in ev ? ev.id : '',
        ...('deltaMs' in ev && ev.deltaMs !== undefined ? { deltaMs: ev.deltaMs } : {}),
      };
      const base = {
        tMs: Date.now(),
        sessionId: o.sessionId,
        stepId: target ? target.id : '',
        skillIds: [],
        target: { label: o.label, notes: target ? target.notes : [] },
        latencyMs: 0,
        scaffold: 'full' as const,
        usedHint: false,
      };
      if (ev.type === 'chord' && target) {
        const v: Verdict = ev.verdict;
        diagnostics.listen({
          tMs: Date.now(),
          kind: 'chord',
          expected: target.notes.map((n) => ({ string: n.string, midi: n.midi })),
          ok: v.ok,
          perNote: v.perNote.map((n) => ({
            string: n.string,
            state: n.state,
            score: +n.score.toFixed(3),
            ...(n.heard !== undefined ? { heard: n.heard } : {}),
          })),
          extra: v.extra.map((x) => ({ string: x.string, score: +x.score.toFixed(3) })),
          ...(info.deltaMs !== undefined ? { deltaMs: Math.round(info.deltaMs) } : {}),
        });
        streak.current = v.ok ? streak.current + 1 : 0;
        fails.current = v.ok ? 0 : fails.current + 1;
        setCoach(coachChord(v, { streak: streak.current, failsInARow: fails.current }));
        setDots(judgedDots(v, o.capo ?? 0));
        void logAttempt(attemptFromChord(base, v));
        if (v.ok) void chime(o.a4Hz);
        count(v.ok);
        o.onAttempt?.(v.ok, ev.start, info);
      } else if (ev.type === 'note' && target) {
        const n = target.notes[0]!;
        const ch: NoteCheck = ev.check;
        diagnostics.listen({
          tMs: Date.now(),
          kind: 'note',
          expected: [{ string: n.string, midi: n.midi }],
          ok: ch.ok,
          perNote: [
            {
              string: n.string,
              state: ch.state,
              score: +ch.score.toFixed(3),
              ...(ch.heard !== undefined ? { heard: ch.heard } : {}),
            },
          ],
          ...(info.deltaMs !== undefined ? { deltaMs: Math.round(info.deltaMs) } : {}),
        });
        streak.current = ch.ok ? streak.current + 1 : 0;
        setCoach(coachNote(ch, n.string, { streak: streak.current }));
        setDots(new Map([[`${n.string}-${n.fret + (o.capo ?? 0)}`, ch.ok ? 'good' : 'fix']]));
        void logAttempt(attemptFromNote(base, ch, n.string));
        count(ch.ok);
        o.onAttempt?.(ch.ok, ev.t, info);
      }
    });
  }, [on]);

  const startStringCheck = useCallback(() => {
    const e = latest.current.expectation;
    if (!e) return;
    const low = [...e.notes].sort((a, b) => b.string - a.string);
    setCheck({
      queue: low.map((n) => ({
        id: `${e.id}:s${n.string}`,
        kind: 'note' as const,
        notes: [n],
        ...(e.a4Hz ? { a4Hz: e.a4Hz } : {}),
      })),
      results: [],
    });
    setCoach(null);
  }, []);

  return {
    on,
    mic: mic.status,
    coach,
    dots,
    level,
    check,
    stats,
    toggle,
    startStringCheck,
    stopStringCheck: () => setCheck(null),
  };
}

/** A soft two-note chime for a clean attempt (quiet; masked from the listener like every app sound). */
async function chime(a4Hz: number): Promise<void> {
  await playNotes(
    [
      { midi: 81, offset: 0, gain: 0.12 },
      { midi: 88, offset: 0.08, gain: 0.1 },
    ],
    a4Hz,
  );
}
