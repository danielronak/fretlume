import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { peakFrequencyHz } from './spectrum';

/** dB magnitude spectrum of a Hann-windowed sine, computed directly (no FFT library needed). */
function hannSineSpectrumDb(fHz: number, sampleRate: number, fftSize: number): Float32Array {
  const bins = fftSize / 2;
  const out = new Float32Array(bins);
  const n = fftSize;
  // Only bins near the tone carry energy; everything else stays at the floor.
  out.fill(-140);
  const centre = Math.round((fHz * n) / sampleRate);
  for (let k = Math.max(1, centre - 6); k <= Math.min(bins - 1, centre + 6); k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
      const x = w * Math.sin((2 * Math.PI * fHz * i) / sampleRate);
      const phase = (-2 * Math.PI * k * i) / n;
      re += x * Math.cos(phase);
      im += x * Math.sin(phase);
    }
    out[k] = 20 * Math.log10(Math.hypot(re, im) / n + 1e-12);
  }
  return out;
}

describe('peakFrequencyHz', () => {
  it('finds low E (82.41 Hz) within half a hertz', () => {
    const db = hannSineSpectrumDb(82.41, 48000, 16384);
    expect(Math.abs(peakFrequencyHz(db, 48000, 16384) - 82.41)).toBeLessThan(0.5);
  });

  it('finds 110 Hz at 44.1 kHz within half a hertz', () => {
    const db = hannSineSpectrumDb(110, 44100, 16384);
    expect(Math.abs(peakFrequencyHz(db, 44100, 16384) - 110)).toBeLessThan(0.5);
  });

  it('returns 0 for silence', () => {
    expect(peakFrequencyHz(new Float32Array(1024).fill(-Infinity), 48000, 2048)).toBe(0);
  });

  it('is within one bin of any tone in the guitar range', () => {
    fc.assert(
      fc.property(fc.double({ min: 70, max: 1400, noNaN: true }), (fHz) => {
        const db = hannSineSpectrumDb(fHz, 48000, 8192);
        expect(Math.abs(peakFrequencyHz(db, 48000, 8192) - fHz)).toBeLessThan(48000 / 8192);
      }),
      { numRuns: 25 },
    );
  });
});
