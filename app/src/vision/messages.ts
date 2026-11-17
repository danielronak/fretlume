/** Messages between the page and the vision worker (docs/specs/01-vision.md §3). */
import type { InstrumentId, LockReply } from './core';
import type { Mat3, Pt } from './geometry';
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
  | { type: 'stop' };

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

export type VisionReply =
  | ({ type: 'lock'; id: number; ms: number } & LockReply)
  | PoseMessage
  | { type: 'error'; message: string };
