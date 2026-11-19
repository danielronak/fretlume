/**
 * Tracking watchdog (field test 2026-11-18): after a large change of angle the tracker can settle on
 * a wrong but self-consistent fit (high confidence, wrong place), and then it never reports the neck
 * as lost, so nothing searches again. Twice a second NeckNet looks at the frame; when at least three of
 * its four corners are more than a nut width from the grid on three checks in a row, the neck is
 * declared lost and the automatic lock takes over. NeckNet sometimes puts one corner on something else
 * (field test 2026-11-19: that alone had ended good tracking), so it catches gross errors only. Pure.
 */
import type { Pt } from './geometry';
import { bassUp, endsByOrientation } from './autoLock';
import type { NeckDetection } from './neckNet';

export type WatchVerdict = 'agree' | 'disagree' | 'unsure';

export interface WatchdogOptions {
  /** Milliseconds between checks. Default 1000. */
  everyMs?: number;
  /** Consecutive disagreements before the neck is declared lost. Default 3. */
  strikes?: number;
}

/** A corner farther than this from NeckNet's (in tracked nut widths) disagrees. */
const CORNER_LIMIT = 1;
/** Corners that must disagree before the grid is called wrong (NeckNet places a single corner on
 * something else now and then: field test 2026-11-19, one or two corners off on ~¼ of real frames). */
const CORNERS_TO_DISAGREE = 3;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Compare one detection with the tracked control points (C0..C3, same pixels). */
export function compare(
  det: Pick<NeckDetection, 'presence' | 'corners' | 'cornerScores' | 'headstockRight'>,
  tracked: Pt[],
): WatchVerdict {
  const [t0, t1] = tracked as [Pt, Pt];
  const nutWidth = dist(t0, t1);
  if (!(nutWidth > 1)) return 'unsure';
  // No neck where the grid is: the guitar left the picture or the grid is somewhere else.
  if (det.presence < 0.2) return 'disagree';
  if (det.presence < 0.6) return 'unsure';
  const corners = bassUp(endsByOrientation(det));
  let seen = 0;
  let off = 0;
  corners.forEach((p, i) => {
    if ((det.cornerScores[i] ?? 0) < 0.4) return;
    seen++;
    // Bass and treble are a guess at NeckNet's resolution: either corner at that end counts.
    const end = i < 2 ? [tracked[0]!, tracked[1]!] : [tracked[2]!, tracked[3]!];
    if (Math.min(dist(p, end[0]!), dist(p, end[1]!)) > CORNER_LIMIT * nutWidth) off++;
  });
  if (seen < CORNERS_TO_DISAGREE) return 'unsure';
  return off >= CORNERS_TO_DISAGREE ? 'disagree' : 'agree';
}

export class TrackingWatchdog {
  private lastMs = -Infinity;
  private strikesSoFar = 0;
  private readonly everyMs: number;
  private readonly strikes: number;

  constructor(options: WatchdogOptions = {}) {
    this.everyMs = options.everyMs ?? 1000;
    this.strikes = options.strikes ?? 3;
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
