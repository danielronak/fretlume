/**
 * Diagnostics (docs/specs/06-testing-and-data.md §4): a short in-memory record of what the vision
 * pipeline did, exported only when the player asks. Camera frames are kept only after the player
 * switches "Include camera frames" on, at 2 per second for the last 15 seconds, and only in memory.
 */
import type { LockReply } from '@vision/core';
import type { Mat3, Pt } from '@vision/geometry';
import type { PoseMessage } from '@vision/messages';

export interface PoseRecord {
  tMs: number;
  state: string;
  confidence: number;
  measured: boolean;
  ms: number;
  samples: number;
  H: Mat3 | null;
}

export interface LockRecord {
  tMs: number;
  taps: Pt[];
  video: { width: number; height: number };
  reply: Omit<LockReply, 'H'> & { H: Mat3 };
  /** Fret shift chosen at confirmation, if confirmed. */
  confirmedShift?: number;
}

export interface FrameRecord {
  tMs: number;
  /** JPEG data URL at reduced size. */
  jpeg: string;
}

export interface DiagnosticsBundle {
  kind: 'fretlume-diagnostics';
  version: 1;
  app: string;
  exportedAt: string;
  device: Record<string, unknown>;
  settings: Record<string, unknown>;
  poses: PoseRecord[];
  locks: LockRecord[];
  events: { tMs: number; text: string }[];
  frames: FrameRecord[];
}

export const POSE_CAPACITY = 1800; // ~60 s at 30 frames/s
export const FRAME_CAPACITY = 30; // 15 s at 2 frames/s
export const FRAME_INTERVAL_MS = 500;

export class DiagnosticsRecorder {
  poses: PoseRecord[] = [];
  locks: LockRecord[] = [];
  events: { tMs: number; text: string }[] = [];
  frames: FrameRecord[] = [];
  /** The player agreed to keep camera frames for the next export. */
  recordFrames = false;
  private lastFrameMs = -Infinity;

  pose(p: PoseMessage): void {
    this.poses.push({
      tMs: p.tCaptureMs,
      state: p.state,
      confidence: p.confidence,
      measured: p.measured,
      ms: p.ms,
      samples: p.samples,
      H: p.H,
    });
    if (this.poses.length > POSE_CAPACITY) this.poses.splice(0, this.poses.length - POSE_CAPACITY);
  }

  lock(record: LockRecord): void {
    this.locks.push(record);
    if (this.locks.length > 50) this.locks.shift();
  }

  confirm(shift: number): void {
    const last = this.locks.at(-1);
    if (last) last.confirmedShift = shift;
  }

  event(tMs: number, text: string): void {
    this.events.push({ tMs, text });
    if (this.events.length > 200) this.events.shift();
  }

  /** True when a frame should be captured now (consent given and the interval has passed). */
  wantsFrame(tMs: number): boolean {
    return this.recordFrames && tMs - this.lastFrameMs >= FRAME_INTERVAL_MS;
  }

  frame(tMs: number, jpeg: string): void {
    if (!this.recordFrames) return;
    this.lastFrameMs = tMs;
    this.frames.push({ tMs, jpeg });
    if (this.frames.length > FRAME_CAPACITY) this.frames.shift();
  }

  setRecordFrames(on: boolean): void {
    this.recordFrames = on;
    if (!on) this.frames = [];
  }

  bundle(
    app: string,
    device: Record<string, unknown>,
    settings: Record<string, unknown>,
    now = new Date(),
  ): DiagnosticsBundle {
    return {
      kind: 'fretlume-diagnostics',
      version: 1,
      app,
      exportedAt: now.toISOString(),
      device,
      settings,
      poses: [...this.poses],
      locks: [...this.locks],
      events: [...this.events],
      frames: this.recordFrames ? [...this.frames] : [],
    };
  }

  clear(): void {
    this.poses = [];
    this.locks = [];
    this.events = [];
    this.frames = [];
  }
}

export const diagnostics = new DiagnosticsRecorder();

export function diagnosticsFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `fretlume-diagnostics-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
}

/** What we tell the developer about the device: no identifiers, nothing personal. */
export function deviceInfo(): Record<string, unknown> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    userAgent: nav?.userAgent,
    cores: nav?.hardwareConcurrency,
    memoryGb: (nav as (Navigator & { deviceMemory?: number }) | undefined)?.deviceMemory,
    screen:
      typeof screen === 'undefined'
        ? undefined
        : { width: screen.width, height: screen.height, dpr: globalThis.devicePixelRatio },
  };
}
