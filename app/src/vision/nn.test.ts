import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { halfToFloat, Network, type Manifest, type Tensor } from './nn';

const fixture = (name: string) => resolve(__dirname, '__fixtures__', name);

/** The deterministic input ml/train/export.py uses: 0.5 + 0.5·sin(0.07x + 0.11y + 1.3c). */
export function parityInput(c: number, h: number, w: number): Tensor {
  const data = new Float32Array(c * h * w);
  for (let ch = 0; ch < c; ch++)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        data[(ch * h + y) * w + x] = 0.5 + 0.5 * Math.sin(0.07 * x + 0.11 * y + 1.3 * ch);
  return { c, h, w, data };
}

describe('nn runtime', () => {
  it('decodes half floats', () => {
    expect(halfToFloat(0x3c00)).toBe(1);
    expect(halfToFloat(0xc000)).toBe(-2);
    expect(halfToFloat(0x0000)).toBe(0);
    expect(halfToFloat(0x3555)).toBeCloseTo(0.33325, 5);
    expect(halfToFloat(0x0001)).toBeCloseTo(5.96e-8, 10);
  });

  it('matches PyTorch on the exported test network (BN folded, fp16 weights)', () => {
    const manifest = JSON.parse(readFileSync(fixture('nn-random.json'), 'utf8')) as Manifest;
    const bin = readFileSync(fixture('nn-random.bin'));
    const net = Network.fromBuffers(
      manifest,
      bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength),
    );
    const parity = JSON.parse(readFileSync(fixture('nn-random.parity.json'), 'utf8')) as {
      globals: number[];
      head: [number, number, number, number][];
      headPeak: number[];
    };
    const [c, h, w] = manifest.input;
    const out = net.run(parityInput(c, h, w));
    const head = out.head!;
    expect([head.c, head.h, head.w]).toEqual([13, 40, 72]);
    // Reference uses fp32 weights; the browser uses fp16, so allow a small relative error.
    const tol = (v: number) => 2e-2 + 2e-2 * Math.abs(v);
    let worst = 0;
    for (const [ch, y, x, v] of parity.head) {
      const got = head.data[(ch * head.h + y) * head.w + x]!;
      worst = Math.max(worst, Math.abs(got - v) / tol(v));
    }
    expect(worst).toBeLessThan(1);
    parity.globals.forEach((v, i) =>
      expect(Math.abs(out.globals!.data[i]! - v)).toBeLessThan(tol(v)),
    );
    parity.headPeak.forEach((v, ch) => {
      let peak = -Infinity;
      for (let i = 0; i < head.h * head.w; i++)
        peak = Math.max(peak, head.data[ch * head.h * head.w + i]!);
      expect(Math.abs(peak - v)).toBeLessThan(tol(v));
    });
  });
});
