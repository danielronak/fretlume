/**
 * Metronome timing (docs/specs/02-audio.md §5). Pure: the scheduler asks for the events that fall
 * inside its look-ahead window and plays them on the audio clock.
 */

export interface MeterSpec {
  bpm: number;
  /** Beats in a bar (top number of the time signature). */
  beatsPerBar: number;
  /** 4 = quarter-note beats, 8 = eighth-note beats (6/8 is counted in eighths, felt in two). */
  beatUnit: 4 | 8;
  /** Clicks per beat: 1, 2 (eighths), 3 (triplets), 4 (sixteenths). */
  subdivision: 1 | 2 | 3 | 4;
  accentFirst: boolean;
  /** Bars of count-in before the first counted bar. */
  countInBars: number;
}

export type ClickKind = 'bar' | 'group' | 'beat' | 'sub';

export interface BeatEvent {
  /** Index from the start, counting every click. */
  index: number;
  time: number;
  bar: number;
  /** 0-based beat within the bar. */
  beat: number;
  /** 0-based subdivision within the beat. */
  sub: number;
  kind: ClickKind;
  countIn: boolean;
}

export const MIN_BPM = 30;
export const MAX_BPM = 260;

export const clampBpm = (bpm: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));

export const secondsPerClick = (meter: MeterSpec) => 60 / meter.bpm / meter.subdivision;

/** Compound meters (6/8, 9/8, 12/8) are felt in groups of three beats. */
export function groupSize(meter: Pick<MeterSpec, 'beatsPerBar' | 'beatUnit'>): number {
  return meter.beatUnit === 8 && meter.beatsPerBar % 3 === 0 && meter.beatsPerBar > 3 ? 3 : 1;
}

export function describeClick(index: number, meter: MeterSpec): Omit<BeatEvent, 'time'> {
  const sub = index % meter.subdivision;
  const beatIndex = Math.floor(index / meter.subdivision);
  const beat = beatIndex % meter.beatsPerBar;
  const bar = Math.floor(beatIndex / meter.beatsPerBar);
  const group = groupSize(meter);
  let kind: ClickKind = 'sub';
  if (sub === 0) {
    if (beat === 0 && meter.accentFirst) kind = 'bar';
    else if (group > 1 && beat % group === 0) kind = 'group';
    else kind = 'beat';
  }
  return { index, bar, beat, sub, kind, countIn: bar < meter.countInBars };
}

/** Clicks with index ≥ `fromIndex` whose time is before `until`, for a metronome started at `startTime`. */
export function clicksUntil(
  meter: MeterSpec,
  startTime: number,
  fromIndex: number,
  until: number,
): BeatEvent[] {
  const step = secondsPerClick(meter);
  const out: BeatEvent[] = [];
  for (let index = fromIndex; startTime + index * step < until; index++) {
    out.push({ ...describeClick(index, meter), time: startTime + index * step });
  }
  return out;
}

/** Tempo from taps (ms): median gap of the last few taps; null until there are two usable taps. */
export function tapTempo(tapTimesMs: readonly number[], resetAfterMs = 2000): number | null {
  const recent: number[] = [];
  for (let i = tapTimesMs.length - 1; i >= 0; i--) {
    const t = tapTimesMs[i]!;
    const next = recent[0];
    if (next !== undefined && next - t > resetAfterMs) break;
    recent.unshift(t);
    if (recent.length === 6) break;
  }
  if (recent.length < 2) return null;
  const gaps = recent.slice(1).map((t, i) => t - recent[i]!);
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return clampBpm(60000 / median);
}
