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
import { apply, controlPointsPx, invert, type Mat3, type Pt } from './geometry';
import type { Image } from './image';
import { midwayRidgeRatio, verifyIndex } from './indexCheck';

/** Above this midway/fret ridge ratio a fit is taken for an alias (calibrated on held-out frames). */
const ALIAS_RATIO = 0.6;
/** Index verdicts with a smaller margin are treated as undecided. */
const INDEX_MIN_MARGIN = 0.15;
import { fullScore, homographyFromTaps, shiftFrets, snapLock } from './lock';
import { fretAtX, fretX, halfWidth, type InstrumentModel } from '@core/guitar/instrument';
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
  // Calibrated on held-out frames (G4.3): below this, fits were mostly wrong-scale (DECISIONS D-021).
  minConfidence: 0.62,
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

  /**
   * One detection and fit on this frame, without the verification over several frames: used to put
   * the grid back while tracking is recovering (the tracking session then checks it frame by frame).
   */
  find(image: Image): AutoLockStatus {
    return this.search(image);
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
    // Bass versus treble cannot be seen at the network's resolution; a player's thick string faces
    // up (towards their head) whether or not the picture is mirrored, so the upper corners are bass.
    // Multi-start: the network's 12th fret may really be the 11th or 13th (they look alike), and a
    // hand can hide one 12th-fret corner; the snap cannot fix either alone. Try each and keep the
    // best fit. The wire polarity found on the first candidate is reused for the others.
    let best: { H: Mat3; polarity: 'bright' | 'dark'; confidence: number; rank: number } | null =
      null;
    const base4 = bassUp(endsByOrientation(det));
    const candidates = [...twelfthCandidates(base4, model), ...threeCornerCandidates(base4, model)];
    for (const [i, taps] of candidates.entries()) {
      try {
        const out = snapLock(
          this.tracker,
          image,
          taps,
          i === 0 || !best ? {} : { polarity: best.polarity },
        );
        let confidence = out.inliers > 0 ? out.score / fullScore(model) : 0;
        // A fit on every second wire (or similar alias) also shows wires midway between its frets.
        const alias = confidence > 0 ? midwayRidgeRatio(image, out.H, model) : 0;
        if (alias > ALIAS_RATIO) confidence = 0;
        // Candidates often tie on the fit score (field test 2026-11-18: a wrong-scale fit scored
        // the same as the right one); the alias evidence breaks the tie.
        const rank = confidence * (1 - alias);
        if (!best || rank > best.rank)
          best = { H: out.H, polarity: out.polarity, confidence, rank };
      } catch {
        // degenerate candidate
      }
    }
    if (!best || best.confidence < this.o.minConfidence)
      return { ...base, hint: cut ?? 'lift-hand', detection: det };
    // Every whole-fret shift of the comb fits the wires equally well; the detected nut decides
    // which one (when the network is sure of it), then the inlays and nut check the last ±2.
    const anchored = anchorAtNut(best.H, det, model);
    const verdict = verifyIndex(image, anchored, model);
    // A nut NeckNet saw clearly outweighs a weak inlay/nut verdict.
    const nutSeen = Math.min(det.cornerScores[0] ?? 0, det.cornerScores[1] ?? 0) >= 0.8;
    // A near-tie verdict is no evidence (dim rooms: inlays invisible, the nut cue weak; it shifted
    // a right fit by a fret, field test 2026-11-19): the anchored fit stands.
    const weak = verdict.margin < INDEX_MIN_MARGIN || (nutSeen && verdict.margin < 0.5);
    const shift = weak ? 0 : verdict.shift;
    const H = shift ? shiftFrets(anchored, model, shift) : anchored;
    this.verified = 0;
    return {
      state: 'verifying',
      hint: null,
      H,
      polarity: best.polarity,
      confidence: best.confidence,
      indexSure: nutSeen ? shift === 0 || verdict.margin >= 0.5 : verdict.margin > INDEX_MIN_MARGIN,
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

/** C0..C3 with the bass corner the upper one at the nut and at the 12th fret (image y grows down). */
export function bassUp(corners: Pt[]): Pt[] {
  const [c0, c1, c2, c3] = corners as [Pt, Pt, Pt, Pt];
  const [nutBass, nutTreble] = c0.y <= c1.y ? [c0, c1] : [c1, c0];
  const [twTreble, twBass] = c3.y <= c2.y ? [c2, c3] : [c3, c2];
  return [nutBass, nutTreble, twTreble, twBass];
}

/**
 * Tap sets for the snap: as detected, and with the detected "12th fret" read as the 11th or the 13th
 * (the taps then move to where fret 12 would be).
 */
export function twelfthCandidates(taps: Pt[], model: InstrumentModel): Pt[][] {
  const H0 = homographyFromTaps(taps, model);
  const out: Pt[][] = [taps];
  for (const k of [-1, 1]) {
    // If the detected line is fret 12 + k, then board x of fret 12 sits at fretX(12 − k) on H0's scale.
    const x = fretX(model, 12 - k);
    const hw = halfWidth(model, x);
    out.push([taps[0]!, taps[1]!, apply(H0, x, hw), apply(H0, x, -hw)]);
  }
  return out;
}

/**
 * The corner heatmaps can confuse the nut with the 12th fret; the orientation head (which side the
 * headstock is on, ≥ 99 % right on validation) settles it when it is confident.
 */
export function endsByOrientation(det: Pick<NeckDetection, 'corners' | 'headstockRight'>): Pt[] {
  const [c0, c1, c2, c3] = det.corners as [Pt, Pt, Pt, Pt];
  const nutX = (c0.x + c1.x) / 2;
  const twelveX = (c2.x + c3.x) / 2;
  const cornersSayRight = nutX > twelveX;
  const confident = det.headstockRight > 0.85 || det.headstockRight < 0.15;
  if (!confident || cornersSayRight === det.headstockRight > 0.5) return det.corners;
  return [c3, c2, c1, c0];
}

/**
 * Tap sets that rebuild one 12th-fret corner from the other and the nut (the board's width ratio
 * between nut and 12th fret is known), for when a hand hides that corner.
 */
export function threeCornerCandidates(taps: Pt[], model: InstrumentModel): Pt[][] {
  const [c0, c1, c2, c3] = taps as [Pt, Pt, Pt, Pt];
  const ratio = halfWidth(model, fretX(model, 12)) / halfWidth(model, 0);
  const across = { x: (c1.x - c0.x) * ratio, y: (c1.y - c0.y) * ratio }; // bass → treble at the 12th
  return [
    [c0, c1, { x: c3.x + across.x, y: c3.y + across.y }, c3],
    [c0, c1, c2, { x: c2.x - across.x, y: c2.y - across.y }],
  ];
}

/**
 * Shift a fit by whole frets so that its nut sits where NeckNet saw the nut (if it saw it clearly).
 * The fit's fret at the detected nut tells how many frets the comb slipped.
 */
export function anchorAtNut(
  H: Mat3,
  det: Pick<NeckDetection, 'corners' | 'cornerScores'>,
  model: InstrumentModel,
): Mat3 {
  if (Math.min(det.cornerScores[0] ?? 0, det.cornerScores[1] ?? 0) < 0.3) return H;
  const [a, b] = bassUp(det.corners) as [Pt, Pt];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const board = apply(invert(H), mid.x, mid.y);
  const k = Math.round(fretAtX(model, board.x));
  return k === 0 || Math.abs(k) > model.fretCount - 12 ? H : shiftFrets(H, model, k);
}
