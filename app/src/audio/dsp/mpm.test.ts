import { describe, expect, it } from 'vitest';
import { FFT } from './fft';
import { PitchDetector } from './mpm';
import { pluck, sine, withNoise } from './synth';

const cents = (f: number, ref: number) => 1200 * Math.log2(f / ref);
const OPEN_STRINGS = [82.407, 110, 146.832, 195.998, 246.942, 329.628];

describe('FFT', () => {
  it('matches a direct DFT', () => {
    const n = 16;
    const re = Float64Array.from({ length: n }, (_, i) => Math.sin(i) + 0.3 * Math.cos(3 * i));
    const im = new Float64Array(n);
    const copy = [...re];
    new FFT(n).transform(re, im);
    for (let k = 0; k < n; k++) {
      let r = 0;
      let i = 0;
      for (let t = 0; t < n; t++) {
        r += copy[t]! * Math.cos((-2 * Math.PI * k * t) / n);
        i += copy[t]! * Math.sin((-2 * Math.PI * k * t) / n);
      }
      expect(re[k]).toBeCloseTo(r, 9);
      expect(im[k]).toBeCloseTo(i, 9);
    }
  });

  it('inverts', () => {
    const fft = new FFT(64);
    const re = Float64Array.from({ length: 64 }, (_, i) => (i * 7) % 5);
    const original = [...re];
    const im = new Float64Array(64);
    fft.transform(re, im);
    fft.transform(re, im, true);
    re.forEach((v, i) => expect(v).toBeCloseTo(original[i]!, 9));
  });

  it('rejects sizes that are not powers of two', () => {
    expect(() => new FFT(12)).toThrow();
  });
});

describe('PitchDetector (gate G6.1, unit level)', () => {
  const detector = new PitchDetector(4096);

  for (const sampleRate of [44100, 48000]) {
    it(`measures every open string ±20 cents within 1 cent (sine and pluck, ${sampleRate} Hz)`, () => {
      for (const open of OPEN_STRINGS) {
        for (const offset of [-20, 0, 20]) {
          const f = open * 2 ** (offset / 1200);
          for (const signal of [
            sine(f, 0.2, sampleRate),
            pluck(f, 0.4, sampleRate).subarray(2000),
          ]) {
            const result = detector.detect(signal, sampleRate);
            expect(result, `${f} Hz`).not.toBeNull();
            expect(Math.abs(cents(result!.fHz, f)), `${f.toFixed(2)} Hz`).toBeLessThanOrEqual(1);
            expect(result!.clarity).toBeGreaterThan(0.9);
          }
        }
      }
    });
  }

  it('stays within 3 cents with noise at 20 dB SNR', () => {
    for (const open of OPEN_STRINGS) {
      for (const offset of [-20, 20]) {
        const f = open * 2 ** (offset / 1200);
        const signal = withNoise(pluck(f, 0.4, 48000, { seed: Math.round(f) }).subarray(2000), 20);
        const result = detector.detect(signal, 48000);
        expect(Math.abs(cents(result!.fHz, f)), `${f.toFixed(2)} Hz`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('measures the fundamental of a stiff (inharmonic) string, not its sharp overtones', () => {
    for (const f of OPEN_STRINGS) {
      // Slowly fading overtones, stretched by stiffness, as on a real steel string.
      const tone = pluck(f, 2, 48000, { inharmonicity: 1e-4, seed: Math.round(f) });
      for (const tMs of [100, 300, 600]) {
        const end = Math.round(tMs * 48);
        const result = detector.detect(tone.subarray(end - 4096, end), 48000)!;
        expect(Math.abs(cents(result.fHz, f)), `${f} Hz at ${tMs} ms`).toBeLessThanOrEqual(0.5);
        const plain = detector.detect(tone.subarray(end - 4096, end), 48000, { refine: false })!;
        if (tMs === 100) expect(cents(plain.fHz, f)).toBeGreaterThan(1); // the bias the refinement removes
      }
    }
  });

  it('does not jump an octave on a pluck with a weak fundamental', () => {
    const f = 82.407;
    // Second harmonic stronger than the fundamental, as on a low string through a small mic.
    const signal = new Float32Array(4096);
    for (let i = 0; i < signal.length; i++) {
      const t = i / 48000;
      signal[i] =
        0.2 * Math.sin(2 * Math.PI * f * t) +
        0.5 * Math.sin(2 * Math.PI * 2 * f * t) +
        0.2 * Math.sin(2 * Math.PI * 3 * f * t);
    }
    const result = detector.detect(signal, 48000);
    expect(Math.abs(cents(result!.fHz, f))).toBeLessThan(5);
  });

  it('returns nothing for silence and low clarity for noise', () => {
    expect(detector.detect(new Float32Array(4096), 48000)).toBeNull();
    const noise = withNoise(new Float32Array(4096).fill(1e-6), -40, 3);
    const result = detector.detect(noise, 48000);
    expect(result === null || result.clarity < 0.6).toBe(true);
  });
});
