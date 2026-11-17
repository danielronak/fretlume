import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING, TUNINGS } from '@core/theory/tuning';
import { PitchDetector } from './dsp/mpm';
import { pluck } from './dsp/synth';
import { centsBetween, InTuneTracker, interpret, PitchSmoother, tunerTargets } from './tuner';

const targets = tunerTargets(STANDARD_TUNING);

describe('tuner targets', () => {
  it('lists the open strings lowest first with concert pitch', () => {
    expect(targets.map((t) => `${t.string}:${t.name}`)).toEqual([
      '6:E2',
      '5:A2',
      '4:D3',
      '3:G3',
      '2:B3',
      '1:E4',
    ]);
    expect(targets[1]!.fHz).toBeCloseTo(110, 6);
    expect(tunerTargets(STANDARD_TUNING, 432)[1]!.fHz).toBeCloseTo(108, 6);
    expect(tunerTargets(TUNINGS.dropD)[0]!.name).toBe('D2');
  });
});

describe('interpret', () => {
  it('finds the nearest string in auto mode', () => {
    const r = interpret(110 * 2 ** (20 / 1200), targets, { kind: 'auto' })!;
    expect(r.target.name).toBe('A2');
    expect(r.cents).toBeCloseTo(20, 6);
    expect(r.range).toBe('ok');
  });

  it('sticks to the chosen string in guided mode, folding octaves', () => {
    const r = interpret(220 * 2 ** (-5 / 1200), targets, { kind: 'guided', string: 5 })!;
    expect(r.target.name).toBe('A2');
    expect(r.cents).toBeCloseTo(-5, 6);
    // A low E string tuned way down is still the low E string.
    const flat = interpret(82.407 * 2 ** (-150 / 1200), targets, { kind: 'guided', string: 6 })!;
    expect(flat.cents).toBeCloseTo(-150, 2);
  });

  it('flags notes outside the open-string range', () => {
    expect(interpret(880, targets, { kind: 'auto' })!.range).toBe('above');
    expect(interpret(55, targets, { kind: 'auto' })!.range).toBe('below');
    expect(interpret(0, targets, { kind: 'auto' })).toBeNull();
  });
});

describe('PitchSmoother', () => {
  it('needs three clear frames, takes the median, restarts on a new note', () => {
    const s = new PitchSmoother();
    expect(s.push({ fHz: 110, clarity: 0.95 }).stable).toBe(false);
    expect(s.push({ fHz: 112, clarity: 0.95 }).stable).toBe(false);
    expect(s.push({ fHz: 111, clarity: 0.95 })).toEqual({ stable: true, fHz: 111 });
    expect(s.push({ fHz: 147, clarity: 0.95 }).stable).toBe(false);
    expect(s.push({ fHz: 147, clarity: 0.5 }).stable).toBe(false);
    expect(s.push(null).stable).toBe(false);
  });
});

describe('InTuneTracker', () => {
  const reading = (cents: number, string = 5) =>
    interpret(targets.find((t) => t.string === string)!.fHz * 2 ** (cents / 1200), targets, {
      kind: 'guided',
      string,
    });

  it('needs ±3 cents held for 400 ms on the same string', () => {
    const tracker = new InTuneTracker();
    expect(tracker.update(reading(2), 0)).toEqual({ inTune: true, held: false });
    expect(tracker.update(reading(-1), 300)).toEqual({ inTune: true, held: false });
    expect(tracker.update(reading(1), 410)).toEqual({ inTune: true, held: true });
    expect(tracker.update(reading(6), 450)).toEqual({ inTune: false, held: false });
    expect(tracker.update(reading(0), 500).held).toBe(false);
    expect(tracker.update(reading(0, 4), 1000).held).toBe(false); // new string restarts the clock
  });
});

describe('first stable reading (gate G6.1 latency)', () => {
  it('arrives within 150 ms of a pluck (within 5 cents) and settles within 1 cent by 400 ms', () => {
    const sampleRate = 48000;
    const hop = 1024;
    const detector = new PitchDetector(4096);
    for (const target of targets) {
      const onset = 4 * hop + 300; // the pluck starts part-way through a block
      const audio = new Float32Array(sampleRate);
      audio.set(pluck(target.fHz, 0.8, sampleRate), onset);
      const smoother = new PitchSmoother();
      let firstMs: number | null = null;
      let settledError: number | null = null;
      for (let end = hop; end <= audio.length; end += hop) {
        const frame = audio.subarray(Math.max(0, end - 4096), end);
        const padded = new Float32Array(4096);
        padded.set(frame, 4096 - frame.length);
        const smoothed = smoother.push(detector.detect(padded, sampleRate));
        const afterMs = ((end - onset) / sampleRate) * 1000;
        if (!smoothed.stable || end <= onset) continue;
        const error = Math.abs(centsBetween(smoothed.fHz, target.fHz));
        if (firstMs === null) {
          firstMs = afterMs;
          expect(error, `${target.name} first reading`).toBeLessThan(5);
        }
        if (afterMs >= 400) {
          settledError = error;
          break;
        }
      }
      expect(firstMs, target.name).not.toBeNull();
      expect(firstMs!, target.name).toBeLessThanOrEqual(150);
      expect(settledError!, `${target.name} at 400 ms`).toBeLessThan(1);
    }
  });
});
