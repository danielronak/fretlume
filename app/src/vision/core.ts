/**
 * Everything the vision worker does, as a plain class (testable without a Worker): keeps one tracker
 * per instrument, snaps a lock from taps, tracks frames, and converts between video pixels (what the
 * page draws on) and processing pixels (the possibly scaled frame the tracker reads).
 */
import { INSTRUMENTS, type InstrumentModel } from '@core/guitar/instrument';
import { EdgeTracker } from './edgeTracker';
import { multiply, type Mat3, type Pt } from './geometry';
import type { Image } from './image';
import { AutoLocker, type AutoLockStatus } from './autoLock';
import { snapLock, VERIFIED_CONFIDENCE } from './lock';
import { detectNeck } from './neckNet';
import type { Network } from './nn';
import { TrackingSession, type Pose } from './tracking';
import { compare, TrackingWatchdog } from './watchdog';

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
  private net: Network | null = null;
  private auto: AutoLocker | null = null;
  private autoInstrument: InstrumentId | null = null;
  // Twice a second: a wrong grid shows for at most about a second before the search takes over.
  private watchdog = new TrackingWatchdog({ everyMs: 500 });
  /** Last pose in processing px, for the watchdog. */
  private lastPose: Pose | null = null;
  /** The watchdog ended tracking; the next track() reports the loss. */
  private watchLost = false;

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
    this.watchdog.reset(tMs);
    this.lastPose = null;
    this.watchLost = false;
  }

  stop(): void {
    this.session = null;
    this.watchLost = false;
    this.lastPose = null;
    this.auto?.reset();
  }

  get tracking(): boolean {
    return this.session !== null || this.watchLost;
  }

  /** Give the core a NeckNet; automatic lock is available from then on. */
  setNetwork(net: Network | null): void {
    this.net = net;
    this.auto = null;
  }

  /**
   * Automatic lock on one frame (scaled by `scale`); the result's H is in video px. Null without a
   * network.
   */
  autoLock(image: Image, tMs: number, scale: number): AutoLockStatus | null {
    const net = this.net;
    if (!net) return null;
    if (!this.auto || this.autoInstrument !== this.instrument) {
      this.auto = new AutoLocker(this.tracker(), (img) => detectNeck(net, img));
      this.autoInstrument = this.instrument;
    }
    const status = this.auto.update(image, tMs);
    const back = scaling(1 / scale);
    return {
      ...status,
      H: status.H ? multiply(back, status.H) : null,
      detection: status.detection
        ? {
            ...status.detection,
            corners: status.detection.corners.map((p) => ({ x: p.x / scale, y: p.y / scale })),
          }
        : null,
    };
  }

  resetAuto(): void {
    this.auto?.reset();
  }

  /**
   * Watchdog (see watchdog.ts), called by the worker after it has replied with the frame's pose so the
   * overlay never waits for NeckNet. With NeckNet loaded (automatic lock on), about twice a second it
   * checks that the grid is still on the neck; when it is not, tracking ends: the next frame reports
   * the neck as lost and the automatic lock searches from the frame after.
   */
  watch(image: Image, tMs: number): void {
    const pose = this.lastPose;
    if (!this.net || !this.session || !pose || pose.state !== 'locked') return;
    if (!this.watchdog.due(tMs)) return;
    const verdict = compare(detectNeck(this.net, image), pose.controlPoints);
    if (this.watchdog.record(verdict, tMs)) {
      this.session = null;
      this.watchLost = true;
      this.auto?.reset();
    }
  }

  /** Track one frame; returns the pose in video px, or null when not tracking. */
  track(image: Image, tMs: number, scale: number): (Pose & { samples: number }) | null {
    if (!this.session) {
      if (!this.watchLost || !this.lastPose) return null;
      // Ended by the watchdog: report the loss once, in video px.
      this.watchLost = false;
      const back = scaling(1 / this.scale);
      return {
        ...this.lastPose,
        state: 'searching',
        confidence: 0,
        measured: false,
        tCaptureMs: tMs,
        H: multiply(back, this.lastPose.H),
        controlPoints: this.lastPose.controlPoints.map((p) => ({
          x: p.x / this.scale,
          y: p.y / this.scale,
        })),
        samples: 0,
      };
    }
    if (scale !== this.scale) {
      this.session.rescale(scale / this.scale);
      this.scale = scale;
    }
    const pose = this.session.update(image, tMs);
    if (!pose) return null;
    this.lastPose = pose;
    const back = scaling(1 / scale);
    return {
      ...pose,
      H: multiply(back, pose.H),
      controlPoints: pose.controlPoints.map((p) => ({ x: p.x / scale, y: p.y / scale })),
      samples: this.session.lastSamples,
    };
  }
}
