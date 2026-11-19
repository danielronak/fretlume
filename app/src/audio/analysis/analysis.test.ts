import { describe, expect, it } from 'vitest';
import { renderPluck } from '../dsp/karplus';
import { chroma, ChordSmoother, guessChords } from './chroma';
import { detectOnsets, judgeTiming, OnsetDetector, strums, timingBias } from './onsets';
import { midiHz } from './salience';
import { newEnergySpectrum, whiten, windowSpectrum, magnitude } from './spectrum';
import { verifyNote, verifyNotes } from './verify';

const SR = 22050;
const STANDARD = [64, 59, 55, 50, 45, 40];

/** Mix plucks: [midi, start seconds]. */
function mix(notes: [number, number][], seconds = 2): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  notes.forEach(([midi, t], i) => {
    const y = renderPluck(midiHz(midi), SR, { seconds: seconds - t, seed: 3 + i * 7 });
    const s = Math.round(t * SR);
    for (let k = 0; k < y.length && s + k < out.length; k++) out[s + k]! += 0.5 * y[k]!;
  });
  return out;
}

/** A strum of frets per string (index 0 = string 1, −1 muted), low string first, 30 ms apart. */
function strum(frets: number[], skip?: number): Float32Array {
  const notes: [number, number][] = [];
  let k = 0;
  for (let s = 6; s >= 1; s--) {
    const f = frets[s - 1]!;
    if (f < 0) continue;
    if (s !== skip) notes.push([STANDARD[s - 1]! + f, 0.1 + k * 0.03]);
    k++;
  }
  return mix(notes);
}

const expectedOf = (frets: number[]) =>
  frets
    .map((fret, i) => ({ string: i + 1, fret, midi: STANDARD[i]! + fret }))
    .filter((n) => n.fret >= 0);

describe('spectrum', () => {
  it('whitening flattens the floor and keeps peaks', () => {
    const tone = mix([[57, 0]]);
    const w = whiten(magnitude(tone, 2205, 4096), SR);
    const bin = Math.round(220 / (SR / 4096));
    const peak = Math.max(w[bin - 1]!, w[bin]!, w[bin + 1]!);
    const sorted = [...w].sort((a, b) => a - b);
    expect(peak).toBeGreaterThan(20);
    expect(sorted[sorted.length >> 1]!).toBeLessThan(3);
  });
});

describe('single-note verification', () => {
  it('passes the played note; neighbours and octaves do not pass', () => {
    for (const midi of [45, 52, 59, 67, 76]) {
      const spec = windowSpectrum(mix([[midi, 0.1]]), SR, Math.round(0.1 * SR));
      expect(verifyNote(spec, SR, midi).ok, `midi ${midi}`).toBe(true);
      for (const d of [-12, -2, -1, 1, 2, 12])
        expect(verifyNote(spec, SR, midi + d).ok, `midi ${midi} expect ${midi + d}`).toBe(false);
    }
  });

  it('names the note a fret away and an octave low', () => {
    const spec = windowSpectrum(mix([[56, 0.1]]), SR, Math.round(0.1 * SR));
    expect(verifyNote(spec, SR, 55)).toMatchObject({ state: 'wrong', heard: 56 });
    const low = windowSpectrum(mix([[48, 0.1]]), SR, Math.round(0.1 * SR));
    expect(verifyNote(low, SR, 60)).toMatchObject({ state: 'wrong', heard: 48 });
  });

  it('only new energy counts after an earlier note', () => {
    const x = mix([
      [57, 0.1],
      [52, 0.6],
    ]);
    const at = Math.round(0.6 * SR);
    expect(verifyNote(newEnergySpectrum(x, SR, at), SR, 52).ok).toBe(true);
    expect(verifyNote(newEnergySpectrum(x, SR, at), SR, 57).ok).toBe(false);
  });
});

describe('chord verification', () => {
  const C = [0, 1, 0, 2, 3, -1]; // x32010
  const spec = (x: Float32Array) =>
    windowSpectrum(x, SR, Math.round(0.28 * SR), { n: 8192, durationS: 0.45 });

  it('a clean C major passes', () => {
    const v = verifyNotes(spec(strum(C)), SR, expectedOf(C), {
      muted: [{ string: 6, midi: 40 }],
    });
    expect(v.ok).toBe(true);
    // E4 (string 1) doubles E3 (string 4): its harmonics are all shared, so it cannot be judged.
    expect(v.perNote.find((n) => n.string === 1)!.state).toBe('unsure');
  });

  it('a muted G3 (its own harmonics) is named', () => {
    const v = verifyNotes(spec(strum(C, 3)), SR, expectedOf(C));
    expect(v.ok).toBe(false);
    expect(v.perNote.find((n) => n.string === 3)!.state).toMatch(/missing|weak/);
  });

  it('a silent string ringing open is reported as extra', () => {
    const x = strum([0, 1, 0, 2, 3, 0]); // low E rings although the shape mutes it
    const v = verifyNotes(spec(x), SR, expectedOf(C), { muted: [{ string: 6, midi: 40 }] });
    expect(v.extra.map((e) => e.string)).toEqual([6]);
    expect(v.ok).toBe(false);
  });
});

describe('onsets and timing', () => {
  it('finds plucks within a few ms', () => {
    const times = [0.2, 0.45, 0.62, 0.9, 1.3];
    const x = mix(times.map((t, i) => [52 + i * 3, t] as [number, number]));
    const found = detectOnsets(x, { sampleRate: SR });
    expect(found).toHaveLength(times.length);
    found.forEach((t, i) => expect(Math.abs(t - times[i]!)).toBeLessThan(0.025));
  });

  it('streaming in small pieces gives the same onsets', () => {
    const x = mix([
      [52, 0.2],
      [57, 0.7],
    ]);
    const d = new OnsetDetector({ sampleRate: SR });
    const got: number[] = [];
    for (let i = 0; i < x.length; i += 333) got.push(...d.push(x.subarray(i, i + 333)));
    expect(got).toEqual(detectOnsets(x, { sampleRate: SR }));
  });

  it('groups strums and judges timing', () => {
    expect(strums([0.1, 0.13, 0.17, 0.6, 0.62])).toEqual([
      { start: 0.1, end: 0.17, count: 3 },
      { start: 0.6, end: 0.62, count: 2 },
    ]);
    expect(judgeTiming(1030, 1000)).toEqual({ deltaMs: 30, grade: 'perfect' });
    expect(judgeTiming(1100, 1000, 40).grade).toBe('good');
    expect(judgeTiming(880, 1000).grade).toBe('early');
    expect(timingBias([-30, -40, -25]).tendency).toBe('rushing');
    expect(timingBias([5, -5, 10]).tendency).toBe('steady');
  });
});

describe('chroma', () => {
  it('lists the chord being strummed among its three suggestions', () => {
    const am = [0, 1, 2, 2, 0, -1]; // x02210
    const c = chroma(
      windowSpectrum(strum(am), SR, Math.round(0.28 * SR), { n: 8192, durationS: 0.45 }),
      SR,
    );
    expect(guessChords(c).map((g) => g.symbol)).toContain('Am');
    const g = [3, 0, 0, 0, 2, 3]; // 320003
    expect(
      guessChords(
        chroma(
          windowSpectrum(strum(g), SR, Math.round(0.3 * SR), { n: 8192, durationS: 0.45 }),
          SR,
        ),
      ).map((x) => x.symbol),
    ).toContain('G');
  });

  it('the smoother switches only when a new chord holds', () => {
    const s = new ChordSmoother(4);
    expect([s.push('G'), s.push('G'), s.push('G'), s.push('C'), s.push('C'), s.push('C')]).toEqual([
      null,
      null,
      'G',
      'G',
      'G',
      'C',
    ]);
  });
});
