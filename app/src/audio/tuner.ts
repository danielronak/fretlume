/**
 * Tuner logic (docs/specs/02-audio.md §2): which string is being tuned, how far off it is,
 * smoothing, and when a string counts as in tune. Pure; the screen feeds it detector results.
 */
import { midiName, midiToHz } from '@core/theory/pitch';
import type { Tuning } from '@core/theory/types';
import type { PitchResult } from './dsp/mpm';

export interface TunerTarget {
  /** 1 = high e … 6 = low E. */
  string: number;
  midi: number;
  fHz: number;
  /** "E2". */
  name: string;
}

/** Open strings, lowest first (the order guitarists tune in). */
export function tunerTargets(tuning: Tuning, a4Hz = 440): TunerTarget[] {
  return tuning.strings
    .map((midi, index) => ({
      string: index + 1,
      midi,
      fHz: midiToHz(midi, a4Hz),
      name: midiName(midi),
    }))
    .reverse();
}

export const centsBetween = (fHz: number, refHz: number): number => 1200 * Math.log2(fHz / refHz);

export type TunerMode = { kind: 'auto' } | { kind: 'guided'; string: number };

export interface TunerReading {
  fHz: number;
  target: TunerTarget;
  /** Cents from the target string (negative = flat). */
  cents: number;
  /** Outside the open-string range by more than four semitones. */
  range: 'ok' | 'above' | 'below';
}

const RANGE_MARGIN_CENTS = 400;

export function interpret(
  fHz: number,
  targets: TunerTarget[],
  mode: TunerMode,
): TunerReading | null {
  if (targets.length === 0 || !(fHz > 0)) return null;
  const lowest = targets[0]!;
  const highest = targets[targets.length - 1]!;
  let target: TunerTarget;
  let f = fHz;
  if (mode.kind === 'guided') {
    target = targets.find((t) => t.string === mode.string) ?? lowest;
    // A ringing harmonic or a detector octave slip still means "this string".
    if (Math.abs(centsBetween(f, target.fHz * 2)) < 60) f /= 2;
    else if (Math.abs(centsBetween(f, target.fHz / 2)) < 60) f *= 2;
  } else {
    target = targets.reduce((best, t) =>
      Math.abs(centsBetween(f, t.fHz)) < Math.abs(centsBetween(f, best.fHz)) ? t : best,
    );
  }
  const range =
    centsBetween(fHz, highest.fHz) > RANGE_MARGIN_CENTS
      ? 'above'
      : centsBetween(fHz, lowest.fHz) < -RANGE_MARGIN_CENTS
        ? 'below'
        : 'ok';
  return { fHz: f, target, cents: centsBetween(f, target.fHz), range };
}

export interface SmoothedPitch {
  /** No stable pitch: silence, noise, or a note just starting. */
  stable: boolean;
  fHz: number;
}

/**
 * Median of the last few clear readings. A reading becomes stable after three consecutive clear
 * frames of the same note; a jump of more than a semitone starts over (a new string was plucked).
 */
export class PitchSmoother {
  private history: number[] = [];

  constructor(
    private readonly minClarity = 0.85,
    private readonly length = 5,
  ) {}

  push(result: PitchResult | null): SmoothedPitch {
    if (!result || result.clarity < this.minClarity) {
      this.history = [];
      return { stable: false, fHz: 0 };
    }
    const last = this.history[this.history.length - 1];
    if (last !== undefined && Math.abs(centsBetween(result.fHz, last)) > 100) this.history = [];
    this.history.push(result.fHz);
    if (this.history.length > this.length) this.history.shift();
    const sorted = [...this.history].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    return { stable: this.history.length >= 3, fHz: median };
  }

  reset(): void {
    this.history = [];
  }
}

export const IN_TUNE_CENTS = 3;
export const IN_TUNE_HOLD_MS = 400;

/** Tracks how long a string has stayed within ±3 cents. */
export class InTuneTracker {
  private since: number | null = null;
  private string: number | null = null;

  update(reading: TunerReading | null, tMs: number): { inTune: boolean; held: boolean } {
    const inTune =
      reading !== null && reading.range === 'ok' && Math.abs(reading.cents) <= IN_TUNE_CENTS;
    if (!inTune || reading.target.string !== this.string) {
      this.since = inTune ? tMs : null;
      this.string = reading?.target.string ?? null;
      return { inTune, held: false };
    }
    this.since ??= tMs;
    return { inTune, held: tMs - this.since >= IN_TUNE_HOLD_MS };
  }

  reset(): void {
    this.since = null;
    this.string = null;
  }
}
