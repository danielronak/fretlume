/**
 * "What am I playing?" (docs/specs/02-audio.md §4.8): a 12-bin chroma from the whitened spectrum,
 * matched against chord templates. A suggestion only — never used for grading. Pure.
 */
import { NOTE_NAMES_SHARP } from './names';
import { comb, midiHz, type Comb } from './salience';

export const CHORD_TEMPLATES: { id: string; suffix: string; intervals: number[] }[] = [
  { id: 'maj', suffix: '', intervals: [0, 4, 7] },
  { id: 'min', suffix: 'm', intervals: [0, 3, 7] },
  { id: '7', suffix: '7', intervals: [0, 4, 7, 10] },
  { id: 'maj7', suffix: 'maj7', intervals: [0, 4, 7, 11] },
  { id: 'm7', suffix: 'm7', intervals: [0, 3, 7, 10] },
  { id: 'sus2', suffix: 'sus2', intervals: [0, 2, 7] },
  { id: 'sus4', suffix: 'sus4', intervals: [0, 5, 7] },
  { id: 'dim', suffix: 'dim', intervals: [0, 3, 6] },
  { id: 'aug', suffix: 'aug', intervals: [0, 4, 8] },
  { id: '5', suffix: '5', intervals: [0, 7] },
];

/**
 * Pitch classes present, by greedy pitch picking on the whitened spectrum: take the guitar pitch
 * (E2–G#5) with the strongest harmonic comb, note its pitch class, remove its partials, repeat while
 * the next pitch is at least `minShare` of the first. Removing partials keeps a C's third harmonic
 * from adding a G.
 */
export function chroma(spec: Float64Array, sr: number, a4Hz = 440, minShare = 0.06): number[] {
  const out = new Array<number>(12).fill(0);
  const residual = new Float64Array(spec);
  let first = 0;
  for (let pick = 0; pick < 6; pick++) {
    let best: Comb | null = null;
    let bestMidi = 0;
    for (let m = 40; m <= 80; m++) {
      const c = comb(residual, sr, midiHz(m, a4Hz), { harmonics: 6, maxHz: 4000 });
      if (!best || c.salience > best.salience) {
        best = c;
        bestMidi = m;
      }
    }
    if (!best || best.salience <= 0) break;
    if (pick === 0) first = best.salience;
    else if (best.salience < minShare * first) break;
    out[bestMidi % 12] = Math.max(out[bestMidi % 12]!, Math.sqrt(best.salience / first));
    // Remove this pitch's partials (±2 bins).
    for (const k of best.bins) {
      if (k < 0) continue;
      for (let j = Math.max(0, k - 2); j <= Math.min(residual.length - 1, k + 2); j++)
        residual[j] = 1;
    }
  }
  return out;
}

export interface ChordGuess {
  root: number;
  quality: string;
  symbol: string;
  /** Cosine similarity with the template, 0–1. */
  score: number;
}

/** Best-matching chords, best first. Templates weight the root slightly above the other tones. */
export function guessChords(c: readonly number[], top = 3): ChordGuess[] {
  const norm = Math.hypot(...c) || 1;
  const guesses: ChordGuess[] = [];
  for (let root = 0; root < 12; root++)
    for (const t of CHORD_TEMPLATES) {
      const tpl = new Array<number>(12).fill(0);
      t.intervals.forEach((iv, i) => (tpl[(root + iv) % 12] = i === 0 ? 1.2 : 1));
      const tn = Math.hypot(...tpl);
      let dot = 0;
      for (let i = 0; i < 12; i++) dot += c[i]! * tpl[i]!;
      guesses.push({
        root,
        quality: t.id,
        symbol: `${NOTE_NAMES_SHARP[root]}${t.suffix}`,
        // Small penalty per template tone, so a triad is preferred over its seventh when unsure.
        score: dot / (norm * tn) - 0.01 * t.intervals.length,
      });
    }
  return guesses.sort((a, b) => b.score - a.score).slice(0, top);
}

/** Smooth guesses over time (§4.8 "0.5 s HMM smoothing", here a hysteresis vote over recent frames). */
export class ChordSmoother {
  private recent: string[] = [];
  private current: string | null = null;
  constructor(private readonly frames = 6) {}

  push(symbol: string | null): string | null {
    this.recent.push(symbol ?? '');
    if (this.recent.length > this.frames) this.recent.shift();
    const counts = new Map<string, number>();
    for (const s of this.recent) counts.set(s, (counts.get(s) ?? 0) + 1);
    const [best, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
    // Switch only when a new chord holds most of the window.
    if (best !== (this.current ?? '') && n > this.frames / 2) this.current = best || null;
    return this.current;
  }
}
