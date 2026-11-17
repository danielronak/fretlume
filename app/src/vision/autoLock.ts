/**
 * Automatic lock (docs/specs/01-vision.md §3, §6; phase 4 task 4.6):
 * SEARCHING — NeckNet a few times a second → corner candidates → snap with the EdgeTracker (both
 * bass/treble orderings, both wire polarities) → fret-index verification;
 * VERIFYING — the same fit must hold on 5 consecutive frames;
 * LOCKED — handed to the tracking session.
 * False-lock guards: presence, tracker confidence, index margin, temporal consistency. Pure.
 */
import { luma } from './autoLockStats';
import type { EdgeTracker } from './edgeTracker';
import { controlPointsPx, type Mat3, type Pt } from './geometry';
import type { Image } from './image';
import { verifyIndex } from './indexCheck';
import { fullScore, shiftFrets, snapLock } from './lock';
import type { NeckDetection } from './neckNet';

export type AutoState = 'searching' | 'verifying' | 'locked';

/** Why we are still searching; drives the tips on the Stage (spec 05 §3). */
export type SearchHint =
  | 'no-neck'
  | 'too-dark'
  | 'cut-off-left'
  | 'cut-off-right'
  | 'cut-off-top'
  | 'cut-off-bottom'
  | 'hold-still'
  | 'lift-hand';

export interface AutoLockOptions {
  /** Seconds between detections while searching. Default 0.25 (4 Hz). */
  detectEverySec?: number;
  minPresence?: number;
  minConfidence?: number;
  verifyFrames?: number;
  /** Largest control-point move per frame while verifying (fraction of the nut width). */
  maxMove?: number;
}

export interface AutoLockStatus {
  state: AutoState;
  hint: SearchHint | null;
  /** Board → frame px while verifying or locked. */
  H: Mat3 | null;
  polarity: 'bright' | 'dark';
  confidence: number;
  /** The index check was decisive (margin) — otherwise the Stage asks the player to confirm. */
  indexSure: boolean;
  detection: NeckDetection | null;
}

const DEFAULTS = {
  detectEverySec: 0.25,
  minPresence: 0.6,
  minConfidence: 0.45,
  verifyFrames: 5,
  maxMove: 0.6,
};

export class AutoLocker {
  private readonly o: typeof DEFAULTS;
  private lastDetectMs = -Infinity;
  private status: AutoLockStatus = {
    state: 'searching',
    hint: 'no-neck',
    H: null,
    polarity: 'bright',
    confidence: 0,
    indexSure: false,
    detection: null,
  };
  private verified = 0;

  constructor(
    private readonly tracker: EdgeTracker,
    private readonly detect: (image: Image) => NeckDetection,
    options: AutoLockOptions = {},
  ) {
    this.o = { ...DEFAULTS, ...options };
  }

  get current(): AutoLockStatus {
    return this.status;
  }

  reset(): void {
    this.lastDetectMs = -Infinity;
    this.verified = 0;
    this.status = { ...this.status, state: 'searching', hint: 'no-neck', H: null, confidence: 0 };
  }

  /** One camera frame. Detection runs only every `detectEverySec` while searching. */
  update(image: Image, tMs: number): AutoLockStatus {
    if (this.status.state === 'verifying') return (this.status = this.verify(image));
    if (this.status.state === 'locked') return this.status;
    if (tMs - this.lastDetectMs < this.o.detectEverySec * 1000) return this.status;
    this.lastDetectMs = tMs;
    return (this.status = this.search(image));
  }

  private search(image: Image): AutoLockStatus {
    const model = this.tracker.model;
    const base = { ...this.status, state: 'searching' as const, H: null, confidence: 0 };
    if (luma(image) < 35) return { ...base, hint: 'too-dark', detection: null };
    const det = this.detect(image);
    if (det.presence < this.o.minPresence) return { ...base, hint: 'no-neck', detection: det };
    const cut = cutOff(det.corners, image.width, image.height);
    // Bass/treble can be confused in a mirrored view: try both orderings.
    const orderings: Pt[][] = [
      det.corners,
      [det.corners[1]!, det.corners[0]!, det.corners[3]!, det.corners[2]!],
    ];
    let best: { H: Mat3; polarity: 'bright' | 'dark'; confidence: number } | null = null;
    for (const taps of orderings) {
      try {
        const out = snapLock(this.tracker, image, taps);
        const confidence = out.inliers > 0 ? out.score / fullScore(model) : 0;
        if (!best || confidence > best.confidence)
          best = { H: out.H, polarity: out.polarity, confidence };
      } catch {
        // degenerate candidate
      }
    }
    if (!best || best.confidence < this.o.minConfidence)
      return { ...base, hint: cut ?? 'lift-hand', detection: det };
    const verdict = verifyIndex(image, best.H, model);
    const H = verdict.shift ? shiftFrets(best.H, model, verdict.shift) : best.H;
    this.verified = 0;
    return {
      state: 'verifying',
      hint: null,
      H,
      polarity: best.polarity,
      confidence: best.confidence,
      indexSure: verdict.margin > 0.15,
      detection: det,
    };
  }

  private verify(image: Image): AutoLockStatus {
    const model = this.tracker.model;
    const prev = this.status.H!;
    const out = this.tracker.refine(image, prev, {
      iterations: 2,
      wide: false,
      polarity: this.status.polarity,
    });
    const confidence = out.inliers > 0 ? out.score / fullScore(model) : 0;
    const before = controlPointsPx(prev, model);
    const after = controlPointsPx(out.H, model);
    const nut = Math.hypot(before[1]!.x - before[0]!.x, before[1]!.y - before[0]!.y);
    const moved = Math.max(
      ...after.map((p, i) => Math.hypot(p.x - before[i]!.x, p.y - before[i]!.y)),
    );
    if (confidence < this.o.minConfidence || moved > this.o.maxMove * nut) {
      this.verified = 0;
      return { ...this.status, state: 'searching', hint: 'hold-still', H: null, confidence };
    }
    this.verified++;
    return {
      ...this.status,
      state: this.verified >= this.o.verifyFrames ? 'locked' : 'verifying',
      H: out.H,
      confidence,
    };
  }
}

/** Which edge a predicted corner leaves the frame by (the neck is cut off there), if any. */
export function cutOff(corners: Pt[], width: number, height: number): SearchHint | null {
  const margin = 0.02;
  for (const p of corners) {
    if (p.x < -margin * width) return 'cut-off-left';
    if (p.x > (1 + margin) * width) return 'cut-off-right';
    if (p.y < -margin * height) return 'cut-off-top';
    if (p.y > (1 + margin) * height) return 'cut-off-bottom';
  }
  return null;
}
