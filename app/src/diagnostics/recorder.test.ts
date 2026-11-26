import { describe, expect, it } from 'vitest';
import type { PoseMessage } from '@vision/messages';
import {
  DiagnosticsRecorder,
  diagnosticsFileName,
  FRAME_CAPACITY,
  POSE_CAPACITY,
} from './recorder';

const pose = (tMs: number): PoseMessage => ({
  type: 'pose',
  H: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  controlPoints: [],
  confidence: 0.8,
  state: 'locked',
  measured: true,
  tCaptureMs: tMs,
  ms: 20,
  samples: 1000,
});

describe('DiagnosticsRecorder', () => {
  it('keeps a bounded pose log', () => {
    const d = new DiagnosticsRecorder();
    for (let i = 0; i < POSE_CAPACITY + 10; i++) d.pose(pose(i));
    expect(d.poses).toHaveLength(POSE_CAPACITY);
    expect(d.poses[0]!.tMs).toBe(10);
  });

  it('keeps camera frames only with consent, at most 10 per second, and drops them when consent goes', () => {
    const d = new DiagnosticsRecorder();
    expect(d.wantsFrame(0)).toBe(false);
    d.frame(0, 'data:x');
    expect(d.frames).toHaveLength(0);
    d.setRecordFrames(true);
    expect(d.wantsFrame(0)).toBe(true);
    d.frame(0, 'data:a');
    expect(d.wantsFrame(60)).toBe(false);
    expect(d.wantsFrame(100)).toBe(true);
    for (let i = 1; i <= FRAME_CAPACITY + 5; i++) d.frame(i * 100, 'data:b');
    expect(d.frames).toHaveLength(FRAME_CAPACITY);
    d.setRecordFrames(false);
    expect(d.frames).toHaveLength(0);
  });

  it('bundles poses, locks and events, frames only with consent', () => {
    const d = new DiagnosticsRecorder();
    d.pose(pose(1));
    d.lock({
      tMs: 0,
      taps: [{ x: 1, y: 2 }],
      video: { width: 1280, height: 720 },
      reply: {
        H: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        polarity: 'bright',
        confidence: 0.9,
        found: true,
        verified: true,
      },
    });
    d.confirm(-1);
    d.event(5, 'relock');
    d.listen({
      tMs: 6,
      kind: 'chord',
      expected: [{ string: 4, midi: 50 }],
      ok: false,
      perNote: [{ string: 4, state: 'missing', score: 0.1 }],
    });
    d.cost(0.0312345);
    const b = d.bundle(
      '0.2.0',
      { cores: 4 },
      { guitar: 'electric' },
      new Date('2026-11-17T10:00:00Z'),
    );
    expect(b.kind).toBe('fretlume-diagnostics');
    expect(b.poses).toHaveLength(1);
    expect(b.locks[0]!.confirmedShift).toBe(-1);
    expect(b.frames).toEqual([]);
    expect(b.listen[0]!.perNote[0]!.state).toBe('missing');
    expect(b.listenCost).toEqual([0.0312]);
    expect(b.exportedAt).toBe('2026-11-17T10:00:00.000Z');
    d.clear();
    expect(d.poses).toHaveLength(0);
    expect(d.listenRecords).toHaveLength(0);
  });

  it('names files by date', () => {
    expect(diagnosticsFileName(new Date(2026, 10, 17, 9, 5))).toBe(
      'fretlume-diagnostics-2026-11-17-0905.json',
    );
  });
});

describe('microphone audio in diagnostics', () => {
  it('kept only with consent, decimated, the last 10 s as a WAV', () => {
    const d = new DiagnosticsRecorder();
    const block = new Float32Array(48000).fill(0.5);
    d.audio(block, 48000);
    expect(d.bundle('x', {}, {}).audio).toBeNull();
    d.setRecordAudio(true);
    for (let i = 0; i < 12; i++) d.audio(block, 48000);
    const a = d.bundle('x', {}, {}).audio!;
    expect(a.sampleRate).toBe(24000);
    const wav = Buffer.from(a.wavBase64, 'base64');
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(40)).toBe(24000 * 10 * 2);
    expect(wav.readInt16LE(44)).toBe(Math.round(0.5 * 32767));
    d.setRecordAudio(false);
    expect(d.bundle('x', {}, {}).audio).toBeNull();
  });
});
