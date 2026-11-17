/** Input level maths for the meter: dBFS, a smoothed ballistic, and a plain-language verdict. */

export const SILENCE_DB = -100;

export function toDb(linear: number): number {
  return linear > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(linear)) : SILENCE_DB;
}

export function rmsOf(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] ?? 0;
    sum += s * s;
  }
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

export interface MeterState {
  /** Displayed level: rises instantly, falls at `releaseDbPerS`. */
  levelDb: number;
  /** Highest recent peak, held for `holdMs` then released. */
  peakDb: number;
  peakAgeMs: number;
}

export const METER_START: MeterState = { levelDb: SILENCE_DB, peakDb: SILENCE_DB, peakAgeMs: 0 };

export function meterStep(
  previous: MeterState,
  measured: { rmsDb: number; peakDb: number },
  dtMs: number,
  options: { releaseDbPerS?: number; holdMs?: number } = {},
): MeterState {
  const release = ((options.releaseDbPerS ?? 24) * dtMs) / 1000;
  const holdMs = options.holdMs ?? 1500;
  const levelDb = Math.max(measured.rmsDb, previous.levelDb - release, SILENCE_DB);
  if (measured.peakDb >= previous.peakDb) {
    return { levelDb, peakDb: measured.peakDb, peakAgeMs: 0 };
  }
  const peakAgeMs = previous.peakAgeMs + dtMs;
  const peakDb =
    peakAgeMs > holdMs
      ? Math.max(measured.peakDb, previous.peakDb - release, SILENCE_DB)
      : previous.peakDb;
  return { levelDb, peakDb, peakAgeMs };
}

export type LevelVerdict = 'silent' | 'quiet' | 'good' | 'loud';

/** Thresholds chosen for a guitar a metre or so from a laptop microphone. */
export function levelVerdict(levelDb: number, peakDb: number): LevelVerdict {
  if (peakDb >= -1) return 'loud';
  if (levelDb < -60) return 'silent';
  if (levelDb < -45) return 'quiet';
  return 'good';
}
