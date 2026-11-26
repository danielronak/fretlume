/**
 * Diagnostics (docs/specs/06-testing-and-data.md §4): a short in-memory record of what the vision
 * pipeline and the listener did, exported only when the player asks. No audio is ever kept: listening
 * records are verdicts (what was expected, how each string was judged). Camera frames are kept only after the player
 * switches "Include camera frames" on, at 10 per second for the last 10 seconds, and only in memory.
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

/** One listening verdict (phase 6 task 6.9). */
export interface ListenRecord {
  tMs: number;
  kind: 'note' | 'chord';
  expected: { string: number; midi: number }[];
  ok: boolean;
  /** Per string: state, score relative to the threshold, and the pitch heard instead when wrong. */
  perNote: { string: number; state: string; score: number; heard?: number }[];
  extra?: { string: number; score: number }[];
  deltaMs?: number;
  /** RMS of the analysed audio, plucks heard in the strum and its length (field test 2026-11-26). */
  rms?: number;
  plucks?: number;
  strumMs?: number;
}

/** What the browser says about the microphone track (processing it could not switch off). */
export interface MicInfo {
  sampleRate: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  channelCount?: number;
}

/** Seconds of microphone audio kept (only with consent), and the rate it is kept at. */
export const AUDIO_SECONDS = 10;

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
  listen: ListenRecord[];
  /** Share of one CPU core the listener worker used (sampled every 5 s). */
  listenCost: number[];
  mic: MicInfo | null;
  /** The last 10 s of microphone audio as a 16-bit WAV (base64), only with consent. */
  audio: { sampleRate: number; wavBase64: string } | null;
  frames: FrameRecord[];
}

export const POSE_CAPACITY = 1800; // ~60 s at 30 frames/s
// 10 s of video at 10 frames/s, so a session can be replayed frame by frame through the tracker.
export const FRAME_CAPACITY = 100;
export const FRAME_INTERVAL_MS = 100;
/** Width of recorded frames (px); sharp enough to label fret positions by hand. */
export const FRAME_WIDTH = 640;

export class DiagnosticsRecorder {
  poses: PoseRecord[] = [];
  locks: LockRecord[] = [];
  events: { tMs: number; text: string }[] = [];
  frames: FrameRecord[] = [];
  listenRecords: ListenRecord[] = [];
  listenCost: number[] = [];
  mic: MicInfo | null = null;
  /** The player agreed to keep the last 10 s of microphone audio for the next export. */
  recordAudio = false;
  private audioRing: Float32Array | null = null;
  private audioRate = 0;
  private audioWritten = 0;
  private decimate = 1;
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

  listen(record: ListenRecord): void {
    this.listenRecords.push(record);
    if (this.listenRecords.length > 300) this.listenRecords.shift();
  }

  setMic(info: MicInfo | null): void {
    this.mic = info;
  }

  setRecordAudio(on: boolean): void {
    this.recordAudio = on;
    if (!on) {
      this.audioRing = null;
      this.audioWritten = 0;
    }
  }

  /** A block of microphone samples (kept, decimated to ≤ 24 kHz, only while recordAudio is on). */
  audio(samples: Float32Array, sampleRate: number): void {
    if (!this.recordAudio) return;
    const decimate = Math.max(1, Math.round(sampleRate / 24000));
    const rate = sampleRate / decimate;
    if (!this.audioRing || rate !== this.audioRate) {
      this.audioRing = new Float32Array(Math.round(rate * AUDIO_SECONDS));
      this.audioRate = rate;
      this.audioWritten = 0;
      this.decimate = decimate;
    }
    const ring = this.audioRing;
    for (let i = 0; i + this.decimate <= samples.length; i += this.decimate) {
      let v = 0;
      for (let k = 0; k < this.decimate; k++) v += samples[i + k]!;
      ring[this.audioWritten % ring.length] = v / this.decimate;
      this.audioWritten++;
    }
  }

  /** The kept audio, oldest first. */
  private audioSnapshot(): Float32Array | null {
    const ring = this.audioRing;
    if (!ring || this.audioWritten === 0) return null;
    const n = Math.min(this.audioWritten, ring.length);
    const out = new Float32Array(n);
    const start = this.audioWritten - n;
    for (let i = 0; i < n; i++) out[i] = ring[(start + i) % ring.length]!;
    return out;
  }

  cost(share: number): void {
    this.listenCost.push(+share.toFixed(4));
    if (this.listenCost.length > 120) this.listenCost.shift();
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
      listen: [...this.listenRecords],
      listenCost: [...this.listenCost],
      mic: this.mic,
      audio: this.recordAudio ? encodeAudio(this.audioSnapshot(), this.audioRate) : null,
      frames: this.recordFrames ? [...this.frames] : [],
    };
  }

  clear(): void {
    this.poses = [];
    this.locks = [];
    this.events = [];
    this.frames = [];
    this.listenRecords = [];
    this.listenCost = [];
    this.audioRing = null;
    this.audioWritten = 0;
  }
}

/** 16-bit mono WAV, base64. */
export function encodeAudio(
  samples: Float32Array | null,
  sampleRate: number,
): { sampleRate: number; wavBase64: string } | null {
  if (!samples || samples.length === 0) return null;
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const text = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, Math.round(sampleRate), true);
  v.setUint32(28, Math.round(sampleRate) * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) =>
    v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x)) * 32767), true),
  );
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { sampleRate: Math.round(sampleRate), wavBase64: btoa(binary) };
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
