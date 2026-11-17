/**
 * Everything the vision worker does, as a plain class (testable without a Worker): keeps one tracker
 * per instrument, snaps a lock from taps, tracks frames, and converts between video pixels (what the
 * page draws on) and processing pixels (the possibly scaled frame the tracker reads).
 */
import { INSTRUMENTS, type InstrumentModel } from '@core/guitar/instrument';
import { EdgeTracker } from './edgeTracker';
import { multiply, type Mat3, type Pt } from './geometry';
import type { Image } from './image';
import { snapLock, VERIFIED_CONFIDENCE } from './lock';
import { TrackingSession, type Pose } from './tracking';

export type InstrumentId = keyof typeof INSTRUMENTS;

export interface LockReply {
  /** Board → video px. */
  H: Mat3;
  polarity: 'bright' | 'dark';
  confidence: number;
  /** The fit held (inliers > 0). */
  found: boolean;
  /** Confident enough to call the lock verified (G3.2 calibration). */
  verified: boolean;
}

/** Scale matrix: video px → processing px. */
const scaling = (s: number): Mat3 => [s, 0, 0, 0, s, 0, 0, 0, 1];

export class VisionCore {
  private trackers = new Map<InstrumentId, EdgeTracker>();
  private session: TrackingSession | null = null;
  private instrument: InstrumentId = 'steelAcoustic';
  /** Processing px per video px of the frames being tracked. */
  private scale = 1;

  get model(): InstrumentModel {
    return INSTRUMENTS[this.instrument];
  }

  private tracker(): EdgeTracker {
    let t = this.trackers.get(this.instrument);
    if (!t) {
      t = new EdgeTracker(this.model);
      this.trackers.set(this.instrument, t);
    }
    return t;
  }

  setInstrument(id: InstrumentId): void {
    if (id === this.instrument) return;
    this.instrument = id;
    this.session = null;
  }

  /** Snap a lock from taps (video px) on one frame scaled by `scale`. */
  lock(image: Image, tapsVideo: Pt[], scale: number): LockReply {
    const taps = tapsVideo.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    const out = snapLock(this.tracker(), image, taps);
    const H = multiply(scaling(1 / scale), out.H);
    return {
      H,
      polarity: out.polarity,
      confidence: out.confidence,
      found: out.inliers > 0,
      verified: out.inliers > 0 && out.confidence >= VERIFIED_CONFIDENCE,
    };
  }

  /** Start tracking from a confirmed lock (board → video px). */
  confirm(
    Hvideo: Mat3,
    polarity: 'bright' | 'dark',
    tMs: number,
    scale: number,
    image?: Image,
  ): void {
    this.scale = scale;
    this.session = new TrackingSession(this.tracker());
    this.session.lock(multiply(scaling(scale), Hvideo), polarity, tMs, image);
  }

  stop(): void {
    this.session = null;
  }

  /** Track one frame; returns the pose in video px, or null when not tracking. */
  track(image: Image, tMs: number, scale: number): (Pose & { samples: number }) | null {
    if (!this.session) return null;
    if (scale !== this.scale) {
      this.session.rescale(scale / this.scale);
      this.scale = scale;
    }
    const pose = this.session.update(image, tMs);
    if (!pose) return null;
    const back = scaling(1 / scale);
    return {
      ...pose,
      H: multiply(back, pose.H),
      controlPoints: pose.controlPoints.map((p) => ({ x: p.x / scale, y: p.y / scale })),
      samples: this.session.lastSamples,
    };
  }
}
