/**
 * Tracking loop after a lock (docs/specs/01-vision.md §3): predict → EdgeTracker (narrow) → filter →
 * publish. Low confidence holds the last pose; after 0.3 s it starts RECOVERING (wide search from the
 * last good pose); after 1.5 s more it reports SEARCHING (the player re-locks). The narrow search moves
 * the nut by at most a fraction of a fret spacing; the fret index changes only when the inlay/nut check
 * clearly asks for it twice in a row (see update).
 */
import type { EdgeTracker } from './edgeTracker';
import { fretX, halfWidth, type InstrumentModel } from '@core/guitar/instrument';
import {
  apply,
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
import { verifyIndex } from './indexCheck';
import { fullScore, shiftFrets } from './lock';
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
  /** Milliseconds between fret-index checks while tracking (0 = off). Default 200. */
  indexCheckMs?: number;
  filter?: OneEuroOptions;
}

/**
 * Index-check margin (score of the best shift over the runner-up) needed to move the grid. With the
 * hand over the inlays only the nut cue is left, worth ≈ 0.8 on the owner's guitar; at 0.6 no
 * correction was made in 84 synthetic tracking runs without a slip (D-023).
 */
const INDEX_MARGIN = 0.6;

const DEFAULTS = {
  iterations: 3,
  lowConfidence: 0.3,
  recoverAfterMs: 300,
  searchAfterMs: 1500,
  indexCheckMs: 200,
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
  /** Index check (see update): time of the last check and the shift it asked for. */
  private lastIndexMs = -Infinity;
  private pendingShift = 0;
  /** The board's shape in the image at the last accepted measurement (see warped). */
  private shape: Shape | null = null;
  /** Fret-index corrections made so far (diagnostics, benches). */
  indexCorrections = 0;
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
    this.shape = shapeOf(points);
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
      const startH = fromControlPoints(start, model);
      const out = this.tracker.refine(image, startH, {
        iterations: recovering ? 3 : this.options.iterations,
        wide: recovering,
        polarity: this.polarity,
      });
      this.lastSamples = out.samples;
      confidence = out.inliers > 0 ? Math.min(1, out.score / fullScore(model)) : 0;
      // While recovering (a wide search from a stale pose) a fit one fret off looks as good as the
      // right one; refuse fits that move the nut or 12th fret by about half a fret or more.
      const points = controlPointsPx(out.H, model);
      if (
        confidence >= this.options.lowConfidence &&
        !(recovering && slipped(startH, out.H, model)) &&
        !(this.shape && warped(this.shape, start, points, tMs - this.last.tMs))
      )
        measured = points;
    } catch {
      measured = null;
    }

    if (
      measured &&
      this.options.indexCheckMs > 0 &&
      tMs - this.lastIndexMs >= this.options.indexCheckMs
    ) {
      // A fast move can make the narrow search land a whole fret or two off (field test 2026-11-18:
      // lifting the guitar). The inlays and the nut tell; two clear verdicts in a row move it back.
      this.lastIndexMs = tMs;
      const H = fromControlPoints(measured, model);
      const verdict = verifyIndex(image, H, model);
      const k = verdict.margin >= INDEX_MARGIN ? verdict.shift : 0;
      if (k !== 0 && k === this.pendingShift) {
        measured = controlPointsPx(shiftFrets(H, model, k), model);
        this.velocity = measured.map(() => ({ x: 0, y: 0 }));
        for (const f of this.filters) f.reset();
        this.last = { points: measured, tMs };
        this.pendingShift = 0;
        this.indexCorrections++;
      } else this.pendingShift = k;
    }

    if (measured) {
      const dt = Math.max(1, tMs - this.last.tMs);
      // Velocity from consecutive measurements only; after a gap it restarts at zero.
      this.velocity =
        tMs - this.last.tMs <= 250
          ? measured.map((p, i) => ({
              x: 0.7 * ((p.x - this.last!.points[i]!.x) / dt) + 0.3 * this.velocity[i]!.x,
              y: 0.7 * ((p.y - this.last!.points[i]!.y) / dt) + 0.3 * this.velocity[i]!.y,
            }))
          : measured.map(() => ({ x: 0, y: 0 }));
      if (recovering) for (const f of this.filters) f.reset();
      this.shape = shapeOf(measured);
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

/**
 * Index guard: a measurement that moves the nut or the 12th fret along the neck by more than ~half
 * a fret spacing from where this frame's search started could be a fret slip, which tracking must never make
 * (docs/specs/01-vision.md §5). Such frames hold the pose instead.
 */
export function slipped(startH: Mat3, measuredH: Mat3, model: InstrumentModel): boolean {
  const back = invert(startH);
  // At the nut and at the 12th fret: a lagging search can also snap the closely spaced high frets
  // to their neighbours, which looks like a change of scale rather than a jump of the nut.
  for (const n of [0, 12]) {
    const x = fretX(model, n);
    const limit = 0.45 * (fretX(model, n + 1) - x);
    for (const y of [-halfWidth(model, x), halfWidth(model, x)]) {
      const p = apply(measuredH, x, y);
      if (Math.abs(apply(back, p.x, p.y).x - x) > limit) return true;
    }
  }
  return false;
}

/** Scale-free description of the board quad: nut width and 12th-fret width over neck length. */
interface Shape {
  nut: number;
  twelfth: number;
  /** Nut to 12th fret, px. */
  length: number;
}

function shapeOf(points: Pt[]): Shape {
  const [a, b, c, d] = points as [Pt, Pt, Pt, Pt];
  const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);
  const length = (dist(a, d) + dist(b, c)) / 2;
  return { nut: dist(a, b) / length, twelfth: dist(c, d) / length, length };
}

/** Largest change of the board's length in the image per 133 ms (one frame at the app's ~7.5 Hz). */
const LENGTH_STEP = 1.08;

/**
 * Plausibility guard (field test 2026-11-18): a measurement is refused when it moves a control point
 * by more than a nut width from where this frame's search started (the narrow search cannot find
 * a real move that large), or when it changes the board's proportions by more than 35 % from the last
 * accepted frame (a turned guitar changes them gradually; a fit dragged onto a hand or the body
 * changes them at once). Compared with the last frame rather than the lock, so that a guitar tilted
 * a long way is still followed (field test 2026-11-18). The board's length may change by at most 8 %
 * per 133 ms.
 */
export function warped(previous: Shape, start: Pt[], measured: Pt[], dtMs = 133): boolean {
  const [a, b] = start as [Pt, Pt];
  const nutPx = Math.hypot(b.x - a.x, b.y - a.y);
  if (measured.some((p, i) => !(Math.hypot(p.x - start[i]!.x, p.y - start[i]!.y) <= nutPx)))
    return true;
  const s = shapeOf(measured);
  const off = (v: number, ref: number, limit: number) =>
    !(Math.abs(Math.log(v / ref)) <= Math.log(limit));
  // Stretching along the neck is how a fit slides onto the headstock or the body while the guitar
  // moves fast (field test 2026-11-18: +10–15 % per frame); a real move changes it by a few %.
  const steps = Math.max(1, dtMs / 133);
  return (
    off(s.nut, previous.nut, 1.35) ||
    off(s.twelfth, previous.twelfth, 1.35) ||
    off(s.length, previous.length, LENGTH_STEP ** steps)
  );
}
