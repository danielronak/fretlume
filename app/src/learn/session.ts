/**
 * Session engine (docs/specs/04-learning.md §1; phase 5 task 5.1). A session is a list of steps the
 * player goes through: deck transport for practice runs, the Stage deck, and later lessons and tabs.
 * Pure: every action carries its time, nothing reads a clock. Judging (phase 6 task 6.4): the
 * listener reports each attempt; a step with `advance: { auto: 'on-correct' }` (wait-mode) moves on
 * once it is played right, and "mark as played" always lets the player past it.
 */

export type Advance =
  | 'manual'
  | { auto: 'timer'; seconds: number }
  | { auto: 'bars'; n: number }
  /** Wait-mode: move on after a correct attempt, once it has been held `holdMs`. */
  | { auto: 'on-correct'; holdMs?: number };

export type Judge = 'none' | 'audio';

export interface Step<T> {
  id: string;
  /** What to show (a shape, a tab range, a text); opaque to the engine. */
  show: T;
  advance: Advance;
  /** Times the step is played before moving on. Default 1. */
  repeats?: number;
  /** Listen to the player on this step. Default 'none'. */
  judge?: Judge;
}

export interface SessionState<T> {
  steps: Step<T>[];
  index: number;
  /** Repeat of the current step, from 0. */
  repeat: number;
  playing: boolean;
  loop: boolean;
  finished: boolean;
  bpm: number;
  beatsPerBar: number;
  /** Time the current repeat's clock started (playing), shifted by time already spent before a pause. */
  startedMs: number;
  /** Time spent in the current repeat when paused. */
  elapsedMs: number;
  /** Attempts on the current repeat, and how the last one went. */
  attempts: number;
  lastResult: 'correct' | 'wrong' | 'escaped' | null;
  /** When the current repeat was played right (wait-mode waits `holdMs` after it). */
  passedMs: number | null;
  /** Correct attempts in a row (across steps). */
  streak: number;
}

export type SessionAction =
  | { type: 'start'; tMs: number }
  | { type: 'pause'; tMs: number }
  | { type: 'restart'; tMs: number }
  | { type: 'next'; tMs: number }
  | { type: 'back'; tMs: number }
  | { type: 'goto'; index: number; tMs: number }
  | { type: 'setLoop'; loop: boolean; tMs: number }
  | { type: 'setTempo'; bpm: number; tMs: number }
  | { type: 'tick'; tMs: number }
  /** New steps, keeping the position (e.g. the auto-advance setting changed). */
  | { type: 'setSteps'; steps: unknown[]; tMs: number }
  /** The listener judged an attempt at the current step. */
  | { type: 'attempt'; ok: boolean; tMs: number }
  /** The escape hatch: count the current step as played (never leaves a player stuck). */
  | { type: 'markPlayed'; tMs: number };

export function createSession<T>(
  steps: Step<T>[],
  options: { loop?: boolean; bpm?: number; beatsPerBar?: number } = {},
): SessionState<T> {
  return {
    steps,
    index: 0,
    repeat: 0,
    playing: false,
    loop: options.loop ?? false,
    finished: steps.length === 0,
    bpm: options.bpm ?? 90,
    beatsPerBar: options.beatsPerBar ?? 4,
    startedMs: 0,
    elapsedMs: 0,
    attempts: 0,
    lastResult: null,
    passedMs: null,
    streak: 0,
  };
}

/** Duration of one repeat of step `index` (ms), or null for a manual step. */
export function stepDurationMs<T>(s: SessionState<T>, index: number): number | null {
  const step = s.steps[index];
  if (!step || step.advance === 'manual' || step.advance.auto === 'on-correct') return null;
  if (step.advance.auto === 'timer') return step.advance.seconds * 1000;
  return (step.advance.n * s.beatsPerBar * 60_000) / s.bpm;
}

function elapsed<T>(s: SessionState<T>, tMs: number): number {
  return s.playing ? tMs - s.startedMs : s.elapsedMs;
}

/** Time left in the current repeat (ms), or null for a manual step. */
export function remainingMs<T>(s: SessionState<T>, tMs: number): number | null {
  const d = stepDurationMs(s, s.index);
  return d === null ? null : Math.max(0, d - elapsed(s, tMs));
}

/** Repeats done and in total, over the whole session. */
export function progress<T>(s: SessionState<T>): { done: number; total: number } {
  let done = 0;
  let total = 0;
  s.steps.forEach((step, i) => {
    const n = step.repeats ?? 1;
    total += n;
    if (i < s.index) done += n;
    else if (i === s.index) done += s.finished ? n : s.repeat;
  });
  return { done, total };
}

/** Enter step `index` (repeat 0) with its clock starting at `fromMs`. */
function enter<T>(s: SessionState<T>, index: number, fromMs: number): SessionState<T> {
  return {
    ...s,
    index,
    repeat: 0,
    finished: false,
    startedMs: fromMs,
    elapsedMs: 0,
    attempts: 0,
    lastResult: null,
    passedMs: null,
  };
}

/** After the current repeat: the next repeat of this step, or the next step. */
function nextRepeat<T>(s: SessionState<T>, fromMs: number): SessionState<T> {
  const repeats = s.steps[s.index]!.repeats ?? 1;
  if (s.repeat + 1 < repeats)
    return {
      ...s,
      repeat: s.repeat + 1,
      startedMs: fromMs,
      elapsedMs: 0,
      attempts: 0,
      passedMs: null,
    };
  return advanceStep(s, fromMs);
}

const isWaitMode = (step: Step<unknown> | undefined) =>
  !!step && step.advance !== 'manual' && step.advance.auto === 'on-correct';

/** Move past the current step (after its last repeat): next, wrap, or finish. */
function advanceStep<T>(s: SessionState<T>, fromMs: number): SessionState<T> {
  if (s.index + 1 < s.steps.length) return enter(s, s.index + 1, fromMs);
  if (s.loop) return enter(s, 0, fromMs);
  return { ...s, playing: false, finished: true, elapsedMs: 0 };
}

export function reduce<T>(s: SessionState<T>, a: SessionAction): SessionState<T> {
  if (a.type === 'setSteps') {
    const steps = a.steps as Step<T>[];
    if (steps.length === 0) return { ...createSession(steps), loop: s.loop, bpm: s.bpm };
    const index = Math.min(s.index, steps.length - 1);
    const repeat = Math.min(s.repeat, (steps[index]!.repeats ?? 1) - 1);
    return { ...s, steps, index, repeat, finished: s.finished && index === steps.length - 1 };
  }
  if (s.steps.length === 0) return s;
  switch (a.type) {
    case 'start':
      if (s.playing) return s;
      if (s.finished) return { ...enter(s, 0, a.tMs), playing: true };
      return { ...s, playing: true, startedMs: a.tMs - s.elapsedMs };
    case 'pause':
      return s.playing ? { ...s, playing: false, elapsedMs: a.tMs - s.startedMs } : s;
    case 'restart':
      return enter(s, 0, a.tMs);
    case 'next':
      return advanceStep(s, a.tMs);
    case 'back': {
      if (s.index > 0) return enter(s, s.index - 1, a.tMs);
      return s.loop ? enter(s, s.steps.length - 1, a.tMs) : enter(s, 0, a.tMs);
    }
    case 'goto':
      return enter(s, Math.min(s.steps.length - 1, Math.max(0, a.index)), a.tMs);
    case 'setLoop':
      return { ...s, loop: a.loop };
    case 'setTempo':
      return { ...s, bpm: Math.max(20, Math.min(300, a.bpm)) };
    case 'attempt': {
      const step = s.steps[s.index]!;
      const judged: SessionState<T> = {
        ...s,
        attempts: s.attempts + 1,
        lastResult: a.ok ? 'correct' : 'wrong',
        streak: a.ok ? s.streak + 1 : 0,
      };
      if (!a.ok || !isWaitMode(step) || s.passedMs !== null) return judged;
      const hold =
        step.advance !== 'manual' && step.advance.auto === 'on-correct'
          ? (step.advance.holdMs ?? 0)
          : 0;
      return hold > 0 ? { ...judged, passedMs: a.tMs } : nextRepeat(judged, a.tMs);
    }
    case 'markPlayed': {
      const marked: SessionState<T> = { ...s, lastResult: 'escaped', streak: 0 };
      return isWaitMode(s.steps[s.index]) || s.steps[s.index]!.advance === 'manual'
        ? nextRepeat(marked, a.tMs)
        : marked;
    }
    case 'tick': {
      const step = s.steps[s.index]!;
      // A right attempt in wait-mode moves on after its hold, whether or not the deck is playing.
      if (isWaitMode(step) && s.passedMs !== null) {
        const hold =
          step.advance !== 'manual' && step.advance.auto === 'on-correct'
            ? (step.advance.holdMs ?? 0)
            : 0;
        return a.tMs - s.passedMs >= hold ? nextRepeat(s, s.passedMs + hold) : s;
      }
      if (!s.playing) return s;
      const d = stepDurationMs(s, s.index);
      if (d === null) return s;
      const spent = a.tMs - s.startedMs;
      if (spent < d) return s;
      // The next repeat (or step) starts when this one ended, not at the tick: no drift.
      return nextRepeat(s, s.startedMs + d);
    }
  }
}
