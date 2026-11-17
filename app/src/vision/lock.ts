/**
 * Manual lock (docs/specs/01-vision.md §5): the player taps the board corners at the nut and the
 * 12th fret (optionally also at the 5th fret), and the tracker snaps the grid onto the fret wires.
 */
import { fretX, halfWidth, type InstrumentModel } from '@core/guitar/instrument';
import type { EdgeTracker } from './edgeTracker';
import { type RefineResult } from './edgeTracker';
import { fitHomography, fromControlPoints, type Mat3, type Pt } from './geometry';
import type { Image } from './image';

/** Fret positions of the tap pairs, in tap order: nut, 12th, then the optional 5th. */
export const TAP_FRETS = [0, 12, 5] as const;

/**
 * Board points of the taps, in this order: nut bass, nut treble, 12th treble, 12th bass
 * (the four control points), then 5th treble, 5th bass.
 */
export function tapPointsMm(model: InstrumentModel, count: 4 | 6): Pt[] {
  const corner = (n: number, side: 1 | -1) => {
    const x = fretX(model, n);
    return { x, y: side * halfWidth(model, x) };
  };
  const points = [corner(0, -1), corner(0, 1), corner(12, 1), corner(12, -1)];
  if (count === 6) points.push(corner(5, 1), corner(5, -1));
  return points;
}

/** Starting homography from 4 taps (exact) or 6 taps (least squares). */
export function homographyFromTaps(taps: Pt[], model: InstrumentModel): Mat3 {
  if (taps.length === 4) return fromControlPoints(taps, model);
  if (taps.length === 6) return fitHomography(tapPointsMm(model, 6), taps);
  throw new Error(`expected 4 or 6 taps, got ${taps.length}`);
}

export interface LockResult extends RefineResult {
  polarity: 'bright' | 'dark';
  /** Fit score relative to a fully visible neck (≈ 0–1). */
  confidence: number;
}

/**
 * Locks at or above this confidence are shown as verified; below it the player is asked to check
 * the grid. Calibrated by the G3.2 benchmark (docs/benchmarks/vision-phase3.json, G32.confidence):
 * the lowest threshold at which ≥ 98 % of accepted locks were correct.
 */
export const VERIFIED_CONFIDENCE = 0.9;

/** Score of a fit with every fret found in both bands and six strings plus edges at 15 stations. */
export function fullScore(model: InstrumentModel): number {
  const stations = Math.min(15, model.fretCount);
  return 2 * (model.fretCount + 1) + stations * (model.strings * 0.4 + 0.8);
}

/**
 * Snap: refine from the taps with fret wires lighter and darker than the board, keep the better
 * fit. Returns inliers 0 when neither fit holds.
 */
export function snapLock(
  tracker: EdgeTracker,
  image: Image,
  taps: Pt[],
  options: { polarity?: 'bright' | 'dark' } = {},
): LockResult {
  const H0 = homographyFromTaps(taps, tracker.model);
  const polarities = options.polarity ? [options.polarity] : (['bright', 'dark'] as const);
  let best: LockResult | null = null;
  for (const polarity of polarities) {
    const out = tracker.refine(image, H0, { polarity });
    const confidence = out.score / fullScore(tracker.model);
    if (!best || out.score > best.score) best = { ...out, polarity, confidence };
  }
  return best!;
}
