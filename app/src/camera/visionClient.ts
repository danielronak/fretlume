/**
 * Main-thread side of the vision pipeline: frames from a <video> go to the vision worker one at a
 * time (requestVideoFrameCallback, ImageBitmap transferred), poses come back with capture times.
 */
import type { InstrumentId, LockReply } from '@vision/core';
import type { Mat3, Pt } from '@vision/geometry';
import type { PoseMessage, VisionReply, VisionRequest } from '@vision/messages';
import { TierController } from './tiers';

type VideoWithFrames = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    cb: (now: number, meta: { captureTime?: number; mediaTime: number }) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/** Debug mode (localStorage `fretlume.debug` = "1"): poses report the stamped frame number. */
export function debugEnabled(): boolean {
  try {
    return localStorage.getItem('fretlume.debug') === '1';
  } catch {
    return false;
  }
}

export class VisionClient {
  private worker: Worker;
  private busy = false;
  private pumping: { video: VideoWithFrames; handle: number | null; timer: number | null } | null =
    null;
  private nextLockId = 1;
  private pendingLocks = new Map<number, (reply: LockReply & { ms: number }) => void>();
  private readonly poseListeners = new Set<(pose: PoseMessage) => void>();
  readonly tiers = new TierController();
  latest: PoseMessage | null = null;
  lastError: string | null = null;

  constructor() {
    this.worker = new Worker(new URL('../vision/vision.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (event: MessageEvent<VisionReply>) => this.receive(event.data);
  }

  private post(message: VisionRequest, transfer: Transferable[] = []): void {
    this.worker.postMessage(message, transfer);
  }

  private receive(message: VisionReply): void {
    if (message.type === 'lock') {
      const resolve = this.pendingLocks.get(message.id);
      this.pendingLocks.delete(message.id);
      resolve?.(message);
    } else if (message.type === 'pose') {
      this.busy = false;
      this.latest = message;
      this.tiers.report(message.ms);
      for (const l of this.poseListeners) l(message);
    } else {
      this.busy = false;
      this.lastError = message.message;
    }
  }

  onPose(listener: (pose: PoseMessage) => void): () => void {
    this.poseListeners.add(listener);
    return () => this.poseListeners.delete(listener);
  }

  setInstrument(id: InstrumentId): void {
    this.post({ type: 'instrument', id });
  }

  /** Snap a lock on a still frame (any CanvasImageSource the size of the video), taps in video px. */
  async lock(frame: ImageBitmap, taps: Pt[]): Promise<LockReply & { ms: number }> {
    const id = this.nextLockId++;
    const reply = new Promise<LockReply & { ms: number }>((resolve) =>
      this.pendingLocks.set(id, resolve),
    );
    this.post({ type: 'lock', id, frame, scale: 1, taps }, [frame]);
    return reply;
  }

  /** Start tracking; `frame` is the lock frame at the current tier's size (see TrackingSession.lock). */
  confirm(H: Mat3, polarity: 'bright' | 'dark', tMs: number, frame?: ImageBitmap): void {
    this.post(
      { type: 'confirm', H, polarity, tMs, scale: this.tiers.scale, ...(frame ? { frame } : {}) },
      frame ? [frame] : [],
    );
  }

  /** Start sending frames from the video. */
  start(video: HTMLVideoElement): void {
    this.stopPump();
    const v = video as VideoWithFrames;
    this.pumping = { video: v, handle: null, timer: null };
    const schedule = () => {
      if (!this.pumping) return;
      if (v.requestVideoFrameCallback) {
        this.pumping.handle = v.requestVideoFrameCallback((now, meta) => {
          void this.send(v, meta.captureTime ?? now);
          schedule();
        });
      } else {
        this.pumping.timer = window.setTimeout(() => {
          void this.send(v, performance.now());
          schedule();
        }, 33);
      }
    };
    schedule();
  }

  private async send(video: HTMLVideoElement, tMs: number): Promise<void> {
    if (this.busy || video.readyState < 2 || !video.videoWidth) return;
    this.busy = true;
    const scale = this.tiers.scale;
    try {
      const frame = await createImageBitmap(video, {
        resizeWidth: Math.round(video.videoWidth * scale),
        resizeHeight: Math.round(video.videoHeight * scale),
        resizeQuality: 'medium',
      });
      this.post({ type: 'frame', frame, tMs, scale, debug: debugEnabled() }, [frame]);
    } catch {
      this.busy = false;
    }
  }

  private stopPump(): void {
    if (!this.pumping) return;
    const { video, handle, timer } = this.pumping;
    if (handle !== null) video.cancelVideoFrameCallback?.(handle);
    if (timer !== null) clearTimeout(timer);
    this.pumping = null;
  }

  /** Stop sending frames and tracking (the worker stays for the next session). */
  stop(): void {
    this.stopPump();
    this.post({ type: 'stop' });
    this.latest = null;
  }

  dispose(): void {
    this.stop();
    this.worker.terminate();
  }
}
