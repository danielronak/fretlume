import { describe, expect, it } from 'vitest';
import { decode, IN_H, IN_W, letterbox, prepareInput } from './neckNet';

describe('NeckNet input and decoding', () => {
  it('letterboxes 16:9 exactly and 4:3 with bars', () => {
    expect(letterbox(1280, 720)).toEqual({ scale: 0.225, ox: 0, oy: -1 });
    const b = letterbox(640, 480);
    expect(b.scale).toBeCloseTo(1 / 3, 9);
    expect(b.oy).toBe(0);
    expect(b.ox).toBeCloseTo((IN_W - 640 / 3) / 2, 9);
  });

  it('averages pixels and orders channels B, G, R', () => {
    const width = 576;
    const height = 320;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) data.set([255, 128, 0, 255], i * 4);
    const t = prepareInput({ width, height, data, channels: 4 });
    const plane = IN_W * IN_H;
    expect(t.data[0]).toBeCloseTo(0, 6); // blue
    expect(t.data[plane]).toBeCloseTo(128 / 255, 6);
    expect(t.data[2 * plane + 1234]).toBeCloseTo(1, 6); // red
  });

  it('decodes peaks with offsets back to frame pixels', () => {
    const h = IN_H / 4;
    const w = IN_W / 4;
    const head = { c: 13, h, w, data: new Float32Array(13 * h * w).fill(-8) };
    const cells = [
      [10, 60],
      [12, 61],
      [25, 20],
      [22, 19],
    ];
    cells.forEach(([y, x], k) => {
      head.data[(1 + k) * h * w + y! * w + x!] = 3;
      head.data[(5 + 2 * k) * h * w + y! * w + x!] = 0.25;
      head.data[(6 + 2 * k) * h * w + y! * w + x!] = 0.75;
    });
    const globals = { c: 5, h: 1, w: 1, data: new Float32Array([4, -3, 0.1, 2, 0.3]) };
    const d = decode(head, globals, letterbox(1280, 720));
    expect(d.corners[0]!.x).toBeCloseTo(((60 + 0.25) * 4) / 0.225, 6);
    expect(d.corners[0]!.y).toBeCloseTo(((10 + 0.75) * 4 + 1) / 0.225, 6);
    expect(d.presence).toBeGreaterThan(0.98);
    expect(d.headstockRight).toBeLessThan(0.05);
    expect(d.profile.id).toBe('electric');
    expect(d.cornerScores[2]).toBeCloseTo(1 / (1 + Math.exp(-3)), 6);
  });
});
