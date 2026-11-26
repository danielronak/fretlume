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
import { alignToPrevious, snapLock, VERIFIED_CONFIDENCE } from './lock';
import { detectNeck, type NeckDetection } from './neckNet';
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

/**
 * A NeckNet call for a second worker (field test 2026-11-26: inline, each call froze tracking for
 * ~0.35 s once a second on the owner's laptop — half of all the time). The core keeps tracking and
 * applies the answer, against the frame it was asked about, when it comes back.
 */
export interface DetectRequest {
  id: number;
  image: Image;
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
  // Once a second, two strikes: a wrong grid shows for about two seconds at most. NeckNet runs in this
  // worker, so each check delays one tracked frame; checking twice a second made a visible stutter.
  private watchdog = new TrackingWatchdog({ everyMs: 1000, strikes: 2 });
  /** Last pose in processing px, for the watchdog. */
  private lastPose: Pose | null = null;
  /** The watchdog ended tracking; the next track() reports the loss. */
  private watchLost = false;
  /** NeckNet may put the grid back while tracking recovers (see track). */
  private reacquire = false;
  private lastReacquireMs = -Infinity;
  private finder: AutoLocker | null = null;
  /** NeckNet runs in another worker: requests are queued, answers applied later. */
  private asyncDetect = false;
  private nextId = 1;
  private pending: {
    id: number;
    purpose: 'watch' | 'reacquire';
    image: Image;
    tMs: number;
    controlPoints: Pt[];
    sent: boolean;
  } | null = null;
  /** The detection the finder should use (async mode hands it the worker's answer). */
  private given: NeckDetection | null = null;

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
    this.finder = null;
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
    reacquire = false,
  ): void {
    this.scale = scale;
    this.reacquire = reacquire;
    this.lastReacquireMs = -Infinity;
    // With NeckNet to fall back on, a lost neck is handed over sooner (field test 2026-11-19: quick
    // moves lost the neck, and the wide search from the old pose rarely found it).
    this.session = new TrackingSession(this.tracker(), this.net ? { searchAfterMs: 700 } : {});
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
    this.finder = null;
  }

  /** Run watchdog checks and re-finds through takeDetectRequest / detectResult (another worker). */
  setAsyncDetect(on: boolean): void {
    this.asyncDetect = on;
    this.pending = null;
  }

  /** The NeckNet request waiting to be sent, if any (each is handed out once). */
  takeDetectRequest(): DetectRequest | null {
    const p = this.pending;
    if (!p || p.sent) return null;
    p.sent = true;
    return { id: p.id, image: p.image };
  }

  /** The other worker's answer to request `id`. */
  detectResult(id: number, det: NeckDetection): void {
    const p = this.pending;
    if (!p || p.id !== id) return;
    this.pending = null;
    if (!this.session) return;
    if (p.purpose === 'reacquire') {
      // Only while still recovering: tracking may have found its own way back meanwhile.
      if (this.lastPose?.state === 'recovering') this.reacquireWith(p.image, p.tMs, det);
      return;
    }
    const verdict = compare(det, p.controlPoints);
    if (verdict === 'disagree' && this.reacquireWith(p.image, p.tMs, det)) return;
    if (this.watchdog.record(verdict, p.tMs)) {
      this.session = null;
      this.watchLost = true;
      this.auto?.reset();
    }
  }

  private request(purpose: 'watch' | 'reacquire', image: Image, tMs: number): void {
    if (this.pending) return;
    this.pending = {
      id: this.nextId++,
      purpose,
      image,
      tMs,
      controlPoints: this.lastPose?.controlPoints ?? [],
      sent: false,
    };
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
    if (this.asyncDetect) {
      if (this.pending) return;
      // Counts as the check's time now, so another is not queued every frame meanwhile.
      this.watchdog.record('unsure', tMs);
      this.request('watch', image, tMs);
      return;
    }
    const verdict = compare(detectNeck(this.net, image), pose.controlPoints);
    // NeckNet sees the neck elsewhere: try to put the grid there now rather than after three checks.
    if (verdict === 'disagree') {
      this.lastReacquireMs = -Infinity;
      if (this.reacquireOn(image, tMs)) return;
    }
    if (this.watchdog.record(verdict, tMs)) {
      this.session = null;
      this.watchLost = true;
      this.auto?.reset();
    }
  }

  /**
   * While tracking recovers (frames have stopped fitting, usually after a quick move), ask NeckNet
   * where the neck is now and lock there straight away when the fit and its fret index are sure. Only
   * when the player's confirmed grid needed no fret shift, at most four times a second.
   */
  private reacquireOn(image: Image, tMs: number): Pose | null {
    const net = this.net;
    if (!net || !this.reacquire || !this.session || tMs - this.lastReacquireMs < 250) return null;
    this.lastReacquireMs = tMs;
    if (this.asyncDetect) {
      this.request('reacquire', image, tMs);
      return null;
    }
    return this.reacquireWith(image, tMs, detectNeck(net, image));
  }

  /** Lock where NeckNet sees the neck on `image` (when the fit and its index are sure). */
  private reacquireWith(image: Image, tMs: number, det: NeckDetection): Pose | null {
    if (!this.net || !this.reacquire || !this.session) return null;
    this.given = det;
    this.finder ??= new AutoLocker(
      this.tracker(),
      (img) => this.given ?? detectNeck(this.net!, img),
    );
    const found = this.finder.find(image);
    this.given = null;
    if (found.state !== 'verifying' || !found.H) return null;
    // With the fret index uncertain (a hand over the inlays), keep the index the grid had a moment
    // ago: the guitar has barely moved during a short loss.
    const previous = this.lastPose?.controlPoints;
    const H = found.indexSure
      ? found.H
      : previous
        ? alignToPrevious(found.H, previous, this.model)
        : null;
    if (!H) return null;
    this.session.lock(H, found.polarity, tMs, image);
    this.watchdog.reset(tMs);
    this.reacquired++;
    return this.session.pose;
  }

  /** Times NeckNet put the grid back while recovering (diagnostics, benches). */
  reacquired = 0;

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
    let pose = this.session.update(image, tMs);
    if (!pose) return null;
    if (pose.state === 'recovering') pose = this.reacquireOn(image, tMs) ?? pose;
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
