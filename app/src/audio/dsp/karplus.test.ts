import { describe, expect, it } from 'vitest';
import { midiToHz } from '@core/theory/pitch';
import { renderClick, renderPluck } from './karplus';
import { PitchDetector } from './mpm';

const cents = (f: number, ref: number) => 1200 * Math.log2(f / ref);

describe('Karplus–Strong reference tones', () => {
  const detector = new PitchDetector(4096);

  it('sounds every open string and fretted notes up to fret 12 within 1 cent', () => {
    for (const sampleRate of [44100, 48000]) {
      for (let midi = 40; midi <= 76; midi += 3) {
        const f = midiToHz(midi);
        const tone = renderPluck(f, sampleRate, { seconds: 0.6 });
        const result = detector.detect(
          tone.subarray(sampleRate * 0.15, sampleRate * 0.15 + 4096),
          sampleRate,
        );
        expect(result, `midi ${midi}`).not.toBeNull();
        expect(
          Math.abs(cents(result!.fHz, f)),
          `midi ${midi} at ${sampleRate}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it('decays, stays in range and ends silently', () => {
    const tone = renderPluck(110, 48000, { seconds: 2 });
    const rms = (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += tone[i]! ** 2;
      return Math.sqrt(sum / (to - from));
    };
    expect(rms(48000 * 1.5, 48000 * 1.6)).toBeLessThan(rms(0, 4800));
    expect(Math.max(...tone.map(Math.abs))).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(Math.abs(tone[tone.length - 1]!)).toBeLessThan(1e-3);
  });

  it('is deterministic for a seed', () => {
    expect(renderPluck(196, 48000, { seconds: 0.1, seed: 3 })).toEqual(
      renderPluck(196, 48000, { seconds: 0.1, seed: 3 }),
    );
  });

  it('renders short clicks', () => {
    const click = renderClick(1000, 48000);
    expect(click.length).toBe(1680);
    expect(Math.abs(click[click.length - 1]!)).toBeLessThan(0.01);
  });
});
