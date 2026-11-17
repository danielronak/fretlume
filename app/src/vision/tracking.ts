/**
 * Tracking loop after a lock (docs/specs/01-vision.md §3): predict → EdgeTracker (narrow) → filter →
 * publish. Low confidence holds the last pose; after 0.3 s it starts RECOVERING (wide search from the
 * last good pose); after 1.5 s more it reports SEARCHING (the player re-locks). The fret index is never
 * changed here: the narrow search moves the nut by at most a fraction of a fret spacing.
 */
import type { EdgeTracker } from './edgeTracker';
import {
  controlPointsPx,
  fromControlPoints,
  IDENTITY,
  invert,
  multiply,
  normalize,
  type Mat3,
  type Pt,
} from './geometry';
import type { Image } from './image';
import { fullScore } from './lock';
import { OneEuroFilter, type OneEuroOptions } from './oneEuro';

export type TrackState = 'searching' | 'locked' | 'recovering';

export interface Pose {
  /** Filtered board → image homography (what the overlay draws with). */
  H: Mat3;
  controlPoints: Pt[];
  /** 0..1; 0 while holding a pose that was not measured this frame. */
  confidence: number;
  state: TrackState;
  tCaptureMs: number;
  /** Measured this frame (false while holding). */
  measured: boolean;
}

export interface TrackingOptions {
  /** Refinement rounds per frame while tracking. Default 3. */
  iterations?: number;
  /** Below this confidence a frame does not update the pose. Default 0.3. */
  lowConfidence?: number;
  /** Time with no good frame before recovering (ms). Default 300. */
  recoverAfterMs?: number;
  /** Time spent recovering before reporting SEARCHING (ms). Default 1500. */
  searchAfterMs?: number;
  filter?: OneEuroOptions;
}

const DEFAULTS = {
  iterations: 3,
  lowConfidence: 0.3,
  recoverAfterMs: 300,
  searchAfterMs: 1500,
  // Tuned on the G3.3 clips: a lower beta lags behind a moving neck (DECISIONS D-017).
  filter: { minCutoffHz: 1.5, beta: 0.3 },
};

export class TrackingSession {
  private readonly options: typeof DEFAULTS;
  private polarity: 'bright' | 'dark' = 'bright';
  /** Last measured (unfiltered) control points and their time. */
  private last: { points: Pt[]; tMs: number } | null = null;
  private velocity: Pt[] = [];
  private filters: OneEuroFilter[] = [];
  private published: Pose | null = null;
  /** Board → board map from the tracker's own fit to the confirmed pose (see lock). */
  private correction: Mat3 = IDENTITY;
  private lastGoodMs = 0;
  private state: TrackState = 'searching';
  /** Image pixel samples taken by the last update (cost proxy, gate G3.5). */
  lastSamples = 0;

  constructor(
    readonly tracker: EdgeTracker,
    options: TrackingOptions = {},
  ) {
    this.options = { ...DEFAULTS, ...options, filter: options.filter ?? DEFAULTS.filter };
  }

  get currentState(): TrackState {
    return this.state;
  }

  /** Start tracking from a confirmed lock. */
  /**
   * Start tracking from a confirmed lock. With the lock frame, the tracker first measures it: where
   * its own fit settles relative to the confirmed pose becomes a fixed board-space correction, so
   * the pose the player confirmed (including any corner adjustments) is what stays on the neck.
   */
  lock(H: Mat3, polarity: 'bright' | 'dark', tMs: number, image?: Image): void {
    const { model } = this.tracker;
    this.polarity = polarity;
    this.correction = IDENTITY;
    let trackerH = H;
    if (image) {
      try {
        const out = this.tracker.refine(image, H, { iterations: 3, wide: false, polarity });
        if (out.inliers > 0 && out.score / fullScore(model) >= this.options.lowConfidence) {
          trackerH = out.H;
          this.correction = normalize(multiply(invert(out.H), H));
        }
      } catch {
        trackerH = H;
      }
    }
    const points = controlPointsPx(H, model);
    this.last = { points: controlPointsPx(trackerH, model), tMs };
    this.velocity = points.map(() => ({ x: 0, y: 0 }));
    this.filters = points.flatMap(() => [0, 1].map(() => new OneEuroFilter(this.options.filter)));
    this.lastGoodMs = tMs;
    this.state = 'locked';
    this.published = this.publish(points, 1, tMs, true);
  }

  get wirePolarity(): 'bright' | 'dark' {
    return this.polarity;
  }

  /** The frames changed size by `factor` (quality tier): carry the pose over. */
  rescale(factor: number): void {
    if (!this.last || !this.published) return;
    const scale = (p: Pt) => ({ x: p.x * factor, y: p.y * factor });
    this.last = { points: this.last.points.map(scale), tMs: this.last.tMs };
    this.velocity = this.velocity.map(scale);
    for (const f of this.filters) f.reset();
    const points = this.published.controlPoints.map(scale);
    this.published = this.publish(
      points,
      this.published.confidence,
      this.published.tCaptureMs,
      false,
    );
  }

  /** Stop tracking (the player ends the session or starts a new lock). */
  reset(): void {
    this.last = null;
    this.published = null;
    this.state = 'searching';
  }

  update(image: Image, tMs: number): Pose | null {
    if (!this.last || !this.published) return null;
    const { model } = this.tracker;
    const recovering = tMs - this.lastGoodMs > this.options.recoverAfterMs;
    let start: Pt[];
    if (recovering) {
      start = this.last.points;
    } else {
      // Constant-velocity prediction from the last measurement.
      const dt = tMs - this.last.tMs;
      start = this.last.points.map((p, i) => ({
        x: p.x + this.velocity[i]!.x * dt,
        y: p.y + this.velocity[i]!.y * dt,
      }));
    }
    let measured: Pt[] | null = null;
    let confidence = 0;
    try {
      const out = this.tracker.refine(image, fromControlPoints(start, model), {
        iterations: recovering ? 3 : this.options.iterations,
        wide: recovering,
        polarity: this.polarity,
      });
      this.lastSamples = out.samples;
      confidence = out.inliers > 0 ? Math.min(1, out.score / fullScore(model)) : 0;
      if (confidence >= this.options.lowConfidence) measured = controlPointsPx(out.H, model);
    } catch {
      measured = null;
    }

    if (measured) {
      const dt = Math.max(1, tMs - this.last.tMs);
      // Velocity from consecutive measurements only; after a gap it restarts at zero.
      this.velocity =
        tMs - this.last.tMs <= 100
          ? measured.map((p, i) => ({
              x: 0.7 * ((p.x - this.last!.points[i]!.x) / dt) + 0.3 * this.velocity[i]!.x,
              y: 0.7 * ((p.y - this.last!.points[i]!.y) / dt) + 0.3 * this.velocity[i]!.y,
            }))
          : measured.map(() => ({ x: 0, y: 0 }));
      if (recovering) for (const f of this.filters) f.reset();
      this.last = { points: measured, tMs };
      this.lastGoodMs = tMs;
      this.state = 'locked';
      this.published = this.publish(this.toUser(measured), confidence, tMs, true);
    } else {
      const lostFor = tMs - this.lastGoodMs;
      this.state =
        lostFor > this.options.recoverAfterMs + this.options.searchAfterMs
          ? 'searching'
          : lostFor > this.options.recoverAfterMs
            ? 'recovering'
            : 'locked';
      this.published = {
        ...this.published,
        confidence: 0,
        state: this.state,
        tCaptureMs: tMs,
        measured: false,
      };
    }
    return this.published;
  }

  private toUser(points: Pt[]): Pt[] {
    const { model } = this.tracker;
    return controlPointsPx(multiply(fromControlPoints(points, model), this.correction), model);
  }

  private publish(points: Pt[], confidence: number, tMs: number, measured: boolean): Pose {
    const filtered = points.map((p, i) => ({
      x: this.filters[2 * i]!.filter(p.x, tMs),
      y: this.filters[2 * i + 1]!.filter(p.y, tMs),
    }));
    return {
      H: fromControlPoints(filtered, this.tracker.model),
      controlPoints: filtered,
      confidence,
      state: this.state,
      tCaptureMs: tMs,
      measured,
    };
  }
}
