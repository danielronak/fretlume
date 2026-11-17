/** Messages between the page and the vision worker (docs/specs/01-vision.md §3). */
import type { InstrumentId, LockReply } from './core';
import type { Mat3, Pt } from './geometry';
import type { AutoState, SearchHint } from './autoLock';
import type { TrackState } from './tracking';

export type VisionRequest =
  | { type: 'instrument'; id: InstrumentId }
  /** Snap a lock: one frame, taps in video px. */
  | { type: 'lock'; id: number; frame: ImageBitmap; scale: number; taps: Pt[] }
  /** Start tracking from a confirmed lock (board → video px), measured once on the lock frame. */
  | {
      type: 'confirm';
      H: Mat3;
      polarity: 'bright' | 'dark';
      tMs: number;
      scale: number;
      frame?: ImageBitmap;
    }
  | { type: 'frame'; frame: ImageBitmap; tMs: number; scale: number; debug: boolean }
  | { type: 'stop' }
  /** Load NeckNet (from the app's own files) and search for the neck on frames while not tracking. */
  | { type: 'auto'; on: boolean; modelUrl: string };

export interface PoseMessage {
  type: 'pose';
  /** Board → video px; null while not tracking. */
  H: Mat3 | null;
  controlPoints: Pt[];
  confidence: number;
  state: TrackState;
  measured: boolean;
  tCaptureMs: number;
  /** Worker time for this frame, including reading pixels. */
  ms: number;
  samples: number;
  /** Frame number stamped into synthetic test clips (debug only). */
  stamp?: number;
}

export interface AutoMessage {
  type: 'auto';
  state: AutoState;
  hint: SearchHint | null;
  /** Board → video px while verifying or locked. */
  H: Mat3 | null;
  polarity: 'bright' | 'dark';
  confidence: number;
  indexSure: boolean;
  presence: number;
  profile: string | null;
  corners: Pt[];
  ms: number;
  stamp?: number;
}

export type VisionReply =
  | ({ type: 'lock'; id: number; ms: number } & LockReply)
  | AutoMessage
  | { type: 'auto-ready'; ok: boolean; message?: string }
  | PoseMessage
  | { type: 'error'; message: string };
