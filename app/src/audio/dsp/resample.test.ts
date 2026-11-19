import { describe, expect, it } from 'vitest';
import { Resampler } from './resample';

const sine = (f: number, sr: number, n: number) =>
  Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * f * i) / sr));

describe('Resampler', () => {
  it('48 kHz → 22.05 kHz keeps a 440 Hz tone and its phase, in any block sizes', () => {
    const x = sine(440, 48000, 48000);
    const r = new Resampler(48000, 22050);
    const parts: Float32Array[] = [];
    for (let i = 0; i < x.length; i += 1000) parts.push(r.push(x.subarray(i, i + 1000)));
    const y = Float32Array.from(parts.flatMap((p) => [...p]));
    expect(Math.abs(y.length - 22050)).toBeLessThan(40);
    for (let i = 200; i < 20000; i += 997)
      expect(y[i]!).toBeCloseTo(Math.sin((2 * Math.PI * 440 * i) / 22050), 2);
  });

  it('removes content above the new Nyquist (no aliasing)', () => {
    const y = new Resampler(48000, 22050).push(sine(15000, 48000, 48000));
    const rms = Math.sqrt(y.slice(200).reduce((s, v) => s + v * v, 0) / (y.length - 200));
    expect(rms).toBeLessThan(0.01);
  });
});
