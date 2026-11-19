/**
 * Overlay motion prediction (field test 2026-11-19: "make it seamless and smooth"). Poses arrive about
 * ten times a second and describe camera frames that are already 60–150 ms old by the time they are
 * drawn over the live video, so a moving neck had the grid trailing behind it and stepping. The Stage
 * redraws every screen frame; this predicts the control points at the capture time of the video frame
 * being shown, from the velocity of the last tracked poses. Pure; times in ms, points in video px.
 */
import type { Pt } from '@vision/geometry';

export interface PredictorOptions {
  /** Never extrapolate further than this (ms). Default 150. */
  maxAheadMs?: number;
  /** Weight of the newest velocity sample (0..1). Default 0.6. */
  velocityGain?: number;
  /** Poses further apart than this do not give a velocity (ms). Default 300. */
  maxGapMs?: number;
  /**
   * Speeds below this (px per ms, mean over the four points) count as standing still, so the tracker's
   * small frame-to-frame wobble on a still guitar is not extrapolated. Default 0.
   */
  deadbandPxPerMs?: number;
  /**
   * A new pose is reached over this long (ms) instead of in one jump: the difference from the old
   * prediction fades out. Default 0 (jump).
   */
  blendMs?: number;
}

interface Sample {
  points: Pt[];
  tMs: number;
}

export class PosePredictor {
  private last: Sample | null = null;
  private velocity: Pt[] | null = null;
  private readonly maxAheadMs: number;
  private readonly gain: number;
  private readonly maxGapMs: number;
  private readonly blendMs: number;
  private readonly deadband: number;
  private blend: { offset: Pt[]; fromMs: number } | null = null;

  constructor(options: PredictorOptions = {}) {
    this.maxAheadMs = options.maxAheadMs ?? 150;
    this.gain = options.velocityGain ?? 0.6;
    this.maxGapMs = options.maxGapMs ?? 300;
    this.blendMs = options.blendMs ?? 0;
    this.deadband = options.deadbandPxPerMs ?? 0;
  }

  /** Forget the motion (a new lock, a fret shift, a loss). */
  reset(): void {
    this.last = null;
    this.velocity = null;
    this.blend = null;
    this.pendingBlend = false;
    this.prevLast = null;
    this.prevVelocity = null;
  }

  /**
   * A pose from the tracker. Only measured, locked poses carry motion; anything else freezes the
   * prediction at the last pose (holding, recovering).
   */
  push(points: Pt[], tMs: number, moving: boolean): void {
    // Remember where the grid was being drawn, to glide from there (computed at the next draw).
    this.blend = null;
    this.pendingBlend = this.blendMs > 0 && this.last !== null;
    this.prevVelocity = this.velocity;
    this.prevLast = this.last;
    if (!moving || points.length !== 4) {
      this.velocity = null;
      if (points.length === 4) this.last = { points, tMs };
      return;
    }
    const prev = this.last;
    if (prev && tMs > prev.tMs && tMs - prev.tMs <= this.maxGapMs) {
      const dt = tMs - prev.tMs;
      const v = points.map((p, i) => ({
        x: (p.x - prev.points[i]!.x) / dt,
        y: (p.y - prev.points[i]!.y) / dt,
      }));
      this.velocity = this.velocity
        ? v.map((q, i) => ({
            x: this.gain * q.x + (1 - this.gain) * this.velocity![i]!.x,
            y: this.gain * q.y + (1 - this.gain) * this.velocity![i]!.y,
          }))
        : v;
    } else {
      this.velocity = null;
    }
    this.last = { points, tMs };
  }

  private pendingBlend = false;
  private prevVelocity: Pt[] | null = null;
  private prevLast: Sample | null = null;

  private extrapolate(sample: Sample, v: Pt[] | null, tMs: number): Pt[] {
    if (!v) return sample.points;
    // Soft dead band: no extrapolation below the threshold, full above twice it, a ramp between.
    let gain = 1;
    if (this.deadband > 0) {
      const speed = v.reduce((a, q) => a + Math.hypot(q.x, q.y), 0) / v.length;
      gain = Math.min(1, Math.max(0, (speed - this.deadband) / this.deadband));
      if (gain === 0) return sample.points;
    }
    const ahead = gain * Math.min(this.maxAheadMs, Math.max(0, tMs - sample.tMs));
    return sample.points.map((p, i) => ({ x: p.x + v[i]!.x * ahead, y: p.y + v[i]!.y * ahead }));
  }

  /**
   * The capture time the grid drawn at `tMs` actually describes: the last pose's time, plus how far it
   * was extrapolated (tests compare the drawing with the true pose at that time).
   */
  describes(tMs: number): number | null {
    const last = this.last;
    if (!last) return null;
    const v = this.velocity;
    if (!v) return last.tMs;
    let gain = 1;
    if (this.deadband > 0) {
      const speed = v.reduce((a, q) => a + Math.hypot(q.x, q.y), 0) / v.length;
      gain = Math.min(1, Math.max(0, (speed - this.deadband) / this.deadband));
    }
    return last.tMs + gain * Math.min(this.maxAheadMs, Math.max(0, tMs - last.tMs));
  }

  /** Control points at time `tMs` (null before the first pose). */
  at(tMs: number): Pt[] | null {
    const last = this.last;
    if (!last) return null;
    const now = this.extrapolate(last, this.velocity, tMs);
    if (this.pendingBlend && this.prevLast) {
      // First draw after a new pose: start from where the previous pose would have put the grid.
      const old = this.extrapolate(this.prevLast, this.prevVelocity, tMs);
      this.blend = {
        offset: old.map((p, i) => ({ x: p.x - now[i]!.x, y: p.y - now[i]!.y })),
        fromMs: tMs,
      };
      this.pendingBlend = false;
    }
    if (!this.blend) return now;
    const k = 1 - (tMs - this.blend.fromMs) / this.blendMs;
    if (k <= 0) {
      this.blend = null;
      return now;
    }
    const off = this.blend.offset;
    return now.map((p, i) => ({ x: p.x + k * off[i]!.x, y: p.y + k * off[i]!.y }));
  }
}

/**
 * The Stage's settings, tuned on moving synthetic clips (error 6.7 → 3.8 px; bench OverlayLag) and the
 * owner's still guitar (no added wobble): react quickly to changes of speed, ignore speeds under
 * 0.03 px/ms (the tracker's own wobble), never look more than 150 ms ahead.
 */
export const STAGE_PREDICTOR: PredictorOptions = {
  velocityGain: 0.9,
  deadbandPxPerMs: 0.03,
  maxAheadMs: 150,
};
