/**
 * Practice runs (phase 5 task 5.2, parity P-F10): a named list of library cards the player steps
 * through, each held for some seconds or bars and repeated, at a tempo. Pure: turns a run into
 * session steps (learn/session.ts) and validates runs read back from storage or a backup.
 */
import type { ColorMode, LabelMode } from '@overlay/display';
import type { Step } from './session';

export interface RunCard {
  /** Library item id, e.g. "chord-0-maj". */
  itemId: string;
  /** Which entry of the item's deck: 0 = all shapes, then one per shape or voicing. */
  entry: number;
  /** Seconds or bars (the run's unit) this card stays up, per repeat. */
  amount: number;
  repeats: number;
}

export interface PracticeRun {
  id: string;
  name: string;
  updatedAt: number;
  cards: RunCard[];
  unit: 'seconds' | 'bars';
  tempoBpm: number;
  beatsPerBar: number;
  labelMode: LabelMode;
  colorMode: ColorMode;
  loop: boolean;
  /** Play each card's notes with the string synth (the dots light up as they sound). */
  sound: boolean;
}

export const RUN_LIMITS = {
  cards: 50,
  amount: { seconds: [2, 120], bars: [1, 32] },
  repeats: [1, 20],
  tempo: [30, 240],
} as const;

export const DEFAULT_CARD_AMOUNT = { seconds: 8, bars: 2 } as const;

export function newRun(id: string, name: string, itemIds: string[] = []): PracticeRun {
  return {
    id,
    name,
    updatedAt: Date.now(),
    cards: itemIds.map((itemId) => ({
      itemId,
      entry: 0,
      amount: DEFAULT_CARD_AMOUNT.seconds,
      repeats: 1,
    })),
    unit: 'seconds',
    tempoBpm: 80,
    beatsPerBar: 4,
    labelMode: 'notes',
    colorMode: 'group',
    loop: false,
    sound: false,
  };
}

const clamp = (v: unknown, [lo, hi]: readonly [number, number], fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
};

/**
 * A run as stored (or from a backup) made safe: unknown fields dropped, numbers clamped, cards with
 * unknown items removed (`known` says whether an item id exists). Returns null if it is not a run.
 */
export function sanitizeRun(
  value: unknown,
  known: (itemId: string) => boolean,
): PracticeRun | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.name !== 'string' || !v.name.trim()) return null;
  const unit = v.unit === 'bars' ? 'bars' : 'seconds';
  const cards: RunCard[] = (Array.isArray(v.cards) ? v.cards : [])
    .filter(
      (c): c is Record<string, unknown> =>
        !!c && typeof c === 'object' && typeof (c as { itemId?: unknown }).itemId === 'string',
    )
    .filter((c) => known(c.itemId as string))
    .slice(0, RUN_LIMITS.cards)
    .map((c) => ({
      itemId: c.itemId as string,
      entry: clamp(c.entry, [0, 99], 0),
      amount: clamp(c.amount, RUN_LIMITS.amount[unit], DEFAULT_CARD_AMOUNT[unit]),
      repeats: clamp(c.repeats, RUN_LIMITS.repeats, 1),
    }));
  const labelModes: LabelMode[] = ['notes', 'intervals', 'fingers', 'none'];
  const colorModes: ColorMode[] = ['group', 'note', 'degree', 'finger', 'single'];
  return {
    id: v.id,
    name: v.name.trim().slice(0, 80),
    updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : 0,
    cards,
    unit,
    tempoBpm: clamp(v.tempoBpm, RUN_LIMITS.tempo, 80),
    beatsPerBar: clamp(v.beatsPerBar, [2, 7], 4),
    labelMode: labelModes.includes(v.labelMode as LabelMode) ? (v.labelMode as LabelMode) : 'notes',
    colorMode: colorModes.includes(v.colorMode as ColorMode) ? (v.colorMode as ColorMode) : 'group',
    loop: v.loop === true,
    sound: v.sound === true,
  };
}

export interface RunStepShow {
  card: RunCard;
  cardIndex: number;
}

/** Session steps for a run: one per card, timed in its unit, with its repeats. */
export function runSteps(run: PracticeRun): Step<RunStepShow>[] {
  return run.cards.map((card, cardIndex) => ({
    id: `${cardIndex}-${card.itemId}-${card.entry}`,
    show: { card, cardIndex },
    advance:
      run.unit === 'seconds'
        ? { auto: 'timer', seconds: card.amount }
        : { auto: 'bars', n: card.amount },
    repeats: card.repeats,
  }));
}

/** Total playing time of one pass through the run (ms). */
export function runDurationMs(run: PracticeRun): number {
  const barMs = (run.beatsPerBar * 60_000) / run.tempoBpm;
  return run.cards.reduce(
    (sum, c) => sum + c.repeats * (run.unit === 'seconds' ? c.amount * 1000 : c.amount * barMs),
    0,
  );
}

/** Move card `from` to position `to` (both clamped). */
export function moveCard(cards: RunCard[], from: number, to: number): RunCard[] {
  if (from < 0 || from >= cards.length) return cards;
  const out = cards.slice();
  const [card] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, card!);
  return out;
}

/** A copy of a run under a new id and name. */
export function duplicateRun(run: PracticeRun, id: string, name: string): PracticeRun {
  return { ...run, id, name, updatedAt: Date.now(), cards: run.cards.map((c) => ({ ...c })) };
}
