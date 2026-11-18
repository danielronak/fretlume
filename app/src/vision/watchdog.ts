/**
 * Tracking watchdog (field test 2026-11-18): after a large change of angle the tracker can settle on
 * a wrong but self-consistent fit (high confidence, wrong place), and then it never reports the neck
 * as lost, so nothing searches again. About once a second NeckNet looks at the frame; when it
 * clearly disagrees with the tracked grid on two checks in a row, the neck is declared lost and the
 * automatic lock takes over. NeckNet's corners are only a few pixels off at the nut, but the 12th-fret
 * corners can be a fret off, so the thresholds catch gross errors only. Pure.
 */
import type { Pt } from './geometry';
import { bassUp, endsByOrientation } from './autoLock';
import type { NeckDetection } from './neckNet';

export type WatchVerdict = 'agree' | 'disagree' | 'unsure';

export interface WatchdogOptions {
  /** Milliseconds between checks. Default 1000. */
  everyMs?: number;
  /** Consecutive disagreements before the neck is declared lost. Default 2. */
  strikes?: number;
}

/** Nut midpoint farther than this from NeckNet's nut (in tracked nut widths) is a disagreement. */
const NUT_LIMIT = 0.75;
/** 12th-fret midpoint farther than this from NeckNet's (in tracked nut widths). */
const TWELFTH_LIMIT = 1.5;

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Compare one detection with the tracked control points (C0..C3, same pixels). */
export function compare(
  det: Pick<NeckDetection, 'presence' | 'corners' | 'cornerScores' | 'headstockRight'>,
  tracked: Pt[],
): WatchVerdict {
  const [t0, t1, t2, t3] = tracked as [Pt, Pt, Pt, Pt];
  const nutWidth = dist(t0, t1);
  if (!(nutWidth > 1)) return 'unsure';
  // No neck where the grid is: the guitar left the picture or the grid is somewhere else.
  if (det.presence < 0.2) return 'disagree';
  if (det.presence < 0.6) return 'unsure';
  const [n0, n1, n2, n3] = bassUp(endsByOrientation(det)) as [Pt, Pt, Pt, Pt];
  const nutSeen = Math.min(det.cornerScores[0] ?? 0, det.cornerScores[1] ?? 0) >= 0.4;
  const twelfthSeen = Math.min(det.cornerScores[2] ?? 0, det.cornerScores[3] ?? 0) >= 0.4;
  if (!nutSeen && !twelfthSeen) return 'unsure';
  const nutOff = nutSeen ? dist(mid(n0, n1), mid(t0, t1)) / nutWidth : 0;
  const twelfthOff = twelfthSeen ? dist(mid(n2, n3), mid(t2, t3)) / nutWidth : 0;
  return nutOff > NUT_LIMIT || twelfthOff > TWELFTH_LIMIT ? 'disagree' : 'agree';
}

export class TrackingWatchdog {
  private lastMs = -Infinity;
  private strikesSoFar = 0;
  private readonly everyMs: number;
  private readonly strikes: number;

  constructor(options: WatchdogOptions = {}) {
    this.everyMs = options.everyMs ?? 1000;
    this.strikes = options.strikes ?? 2;
  }

  /** Whether a check is due at `tMs`. */
  due(tMs: number): boolean {
    return tMs - this.lastMs >= this.everyMs;
  }

  /** Record a check; returns true when the neck should be declared lost. */
  record(verdict: WatchVerdict, tMs: number): boolean {
    this.lastMs = tMs;
    if (verdict === 'disagree') this.strikesSoFar++;
    else if (verdict === 'agree') this.strikesSoFar = 0;
    return this.strikesSoFar >= this.strikes;
  }

  reset(tMs = -Infinity): void {
    this.lastMs = tMs;
    this.strikesSoFar = 0;
  }
}
