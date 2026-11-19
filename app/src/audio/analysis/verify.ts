/**
 * Expected-note verification (docs/specs/02-audio.md §4.3–4.6). We know what should sound. A note
 * counts by its *unique* harmonics — the partials no other expected note also produces — so an octave
 * doubling or a shared fifth cannot make a missing note look present. Notes whose harmonics are all
 * shared (an E4 over an E3) cannot be judged from the spectrum and are reported as `unsure`, which
 * passes. A missing note is compared with its chromatic neighbours (a finger a fret off); strings that
 * should be silent are checked at their open pitch. Pure.
 */
import { midiHz } from './salience';

export type Leniency = 'relaxed' | 'standard' | 'strict';

export interface ExpectedNote {
  string: number;
  fret: number;
  midi: number;
}

export type NoteState = 'present' | 'unsure' | 'weak' | 'missing' | 'wrong';

export interface NoteVerdict extends ExpectedNote {
  state: NoteState;
  /** Mean whitened magnitude of the unique harmonics (≈ 1 for noise); NaN when none. */
  evidence: number;
  /** Evidence relative to the presence threshold. */
  score: number;
  /** For 'wrong': the pitch that sounded instead (MIDI). */
  heard?: number;
}

export interface Verdict {
  ok: boolean;
  perNote: NoteVerdict[];
  /** Strings that should be silent but ring (open pitch heard). */
  extra: { string: number; midi: number; score: number }[];
  /** 0–1: how far the decision is from its thresholds. */
  confidence: number;
}

export interface Thresholds {
  /** Evidence (whitened magnitude) needed to be present. */
  present: number;
  /** … and at least this fraction of the median evidence of the chord's notes. */
  relative: number;
  /** Below present but above this fraction of it: weak. */
  weak: number;
  /** A neighbour this many times stronger (and itself present) makes a missing note wrong. */
  neighbour: number;
  /** An open string must reach this × present to count as ringing. */
  extra: number;
  weakAllowed: number;
  extraFails: boolean;
}

export const LENIENCY: Record<Leniency, Thresholds> = {
  relaxed: {
    present: 3,
    relative: 0.04,
    weak: 0.6,
    neighbour: 2,
    extra: 3,
    weakAllowed: 2,
    extraFails: false,
  },
  standard: {
    present: 3.5,
    relative: 0.05,
    weak: 0.65,
    neighbour: 1.6,
    extra: 2.2,
    weakAllowed: 1,
    extraFails: true,
  },
  strict: {
    present: 4.5,
    relative: 0.07,
    weak: 0.75,
    neighbour: 1.4,
    extra: 1.6,
    weakAllowed: 0,
    extraFails: true,
  },
};

export const HARMONICS = 10;
/** A single note must reach this fraction of the strongest nearby candidate. */
const SINGLE_RELATIVE = 0.1;
const DECAY = 0.84;
const tolCents = (h: number) => 25 + 3 * (h - 1);

/** Peak whitened magnitude within the tolerance of `f` (at least the nearest bin ± 1). */
function peakAt(spec: Float64Array, binHz: number, f: number, cents: number): number {
  const r = 2 ** (cents / 1200);
  const c = Math.round(f / binHz);
  const k0 = Math.max(1, Math.min(Math.floor(f / r / binHz), c - 1));
  const k1 = Math.min(spec.length - 1, Math.max(Math.ceil((f * r) / binHz), c + 1));
  let best = 0;
  for (let k = k0; k <= k1; k++) if (spec[k]! > best) best = spec[k]!;
  return best;
}

/** Distance in cents from `f` to the nearest harmonic (1–16) of any frequency in `others`. */
function nearestHarmonicCents(f: number, others: readonly number[]): number {
  let best = Infinity;
  for (const g of others) {
    const h = Math.round(f / g);
    if (h < 1 || h > 16) continue;
    best = Math.min(best, Math.abs(1200 * Math.log2(f / (h * g))));
  }
  return best;
}

/** Harmonic numbers (1…HARMONICS) of `f0` below `maxHz` that none of `others` shares at `binHz`. */
export function uniqueHarmonics(
  f0: number,
  others: readonly number[],
  binHz: number,
  maxHz = 5000,
): number[] {
  const out: number[] = [];
  for (let h = 1; h <= HARMONICS; h++) {
    const f = h * f0;
    if (f > maxHz) break;
    const near = nearestHarmonicCents(f, others);
    const nearHz = f * (2 ** (near / 1200) - 1);
    if (near < tolCents(h) + 25 || nearHz < 2.5 * binHz) continue;
    out.push(h);
  }
  return out;
}

/**
 * Mean magnitude over the harmonics of `f0` that none of `others` shares (weighted 0.84^(h−1)), and
 * how many there were. Harmonics within one bin of the Nyquist or above `maxHz` are skipped.
 */
export function uniqueEvidence(
  spec: Float64Array,
  sr: number,
  f0: number,
  others: readonly number[],
  maxHz = 5000,
  maxHarmonic = HARMONICS,
): { evidence: number; count: number } {
  const binHz = sr / ((spec.length - 1) * 2);
  let sum = 0;
  let weights = 0;
  let count = 0;
  let w = 1;
  for (let h = 1; h <= maxHarmonic; h++, w *= DECAY) {
    const f = h * f0;
    if (f > maxHz) break;
    const tol = tolCents(h);
    // Shared if another note's harmonic falls inside this window (plus a margin), or so close in Hz
    // that the two cannot be told apart at this resolution.
    const near = nearestHarmonicCents(f, others);
    const nearHz = f * (2 ** (near / 1200) - 1);
    if (near < tol + 25 || nearHz < 2.5 * binHz) continue;
    sum += w * peakAt(spec, binHz, f, tol);
    weights += w;
    count++;
  }
  return { evidence: count ? sum / weights : NaN, count };
}

export function verifyNotes(
  spec: Float64Array,
  sr: number,
  expected: readonly ExpectedNote[],
  options: {
    muted?: readonly { string: number; midi: number }[];
    leniency?: Leniency;
    a4Hz?: number;
  } = {},
): Verdict {
  const t = LENIENCY[options.leniency ?? 'standard'];
  const a4 = options.a4Hz ?? 440;
  const order = [...expected].sort((a, b) => a.midi - b.midi || b.string - a.string);
  const pitches = [...new Set(order.map((n) => n.midi))];
  const hz = (m: number) => midiHz(m, a4);
  const evidenceOf = new Map(
    pitches.map((m) => [
      m,
      uniqueEvidence(spec, sr, hz(m), pitches.filter((q) => q !== m).map(hz)).evidence,
    ]),
  );
  const known = [...evidenceOf.values()].filter((e) => !Number.isNaN(e)).sort((a, b) => a - b);
  const median = known.length ? known[known.length >> 1]! : 0;
  const threshold = Math.max(t.present, median * t.relative);

  const perNote: NoteVerdict[] = order.map((n) => {
    const evidence = evidenceOf.get(n.midi)!;
    if (Number.isNaN(evidence)) return { ...n, state: 'unsure', evidence, score: 1 };
    const score = evidence / threshold;
    let state: NoteState = score >= 1 ? 'present' : score >= t.weak ? 'weak' : 'missing';
    let heard: number | undefined;
    if (state !== 'present') {
      let best = 0;
      for (const d of [-1, 1, -2, 2]) {
        const m = n.midi + d;
        if (pitches.includes(m)) continue;
        const e = uniqueEvidence(
          spec,
          sr,
          hz(m),
          pitches.filter((q) => q !== n.midi).map(hz),
        ).evidence;
        if (e > best) {
          best = e;
          heard = m;
        }
      }
      if (best >= threshold && best >= t.neighbour * evidence) state = 'wrong';
      else heard = undefined;
    }
    return { ...n, state, evidence, score, ...(heard !== undefined ? { heard } : {}) };
  });

  const extra = (options.muted ?? [])
    .filter((m) => !pitches.includes(m.midi))
    .map((m) => {
      const e = uniqueEvidence(spec, sr, hz(m.midi), pitches.map(hz)).evidence;
      return { string: m.string, midi: m.midi, score: Number.isNaN(e) ? 0 : e / threshold };
    })
    .filter((e) => e.score >= t.extra);

  return decide(perNote, extra, options.leniency ?? 'standard');
}

/** The pass/fail decision and confidence from per-note states (also after refineByTiming). */
export function decide(
  perNote: NoteVerdict[],
  extra: Verdict['extra'],
  leniency: Leniency = 'standard',
): Verdict {
  const t = LENIENCY[leniency];
  const weak = perNote.filter((n) => n.state === 'weak').length;
  const bad = perNote.some((n) => n.state === 'missing' || n.state === 'wrong');
  const ok = !bad && weak <= t.weakAllowed && !(t.extraFails && extra.length > 0);
  const margins = perNote
    .filter((n) => n.state !== 'unsure')
    .map((n) => Math.abs(Math.log2(Math.max(n.score, 1e-3))));
  const confidence = Math.max(0, Math.min(1, Math.min(...margins, 2) / 2));
  return { ok, perNote, extra, confidence };
}

export interface NoteCheck {
  ok: boolean;
  state: 'present' | 'weak' | 'missing' | 'wrong';
  /** Evidence relative to the threshold. */
  score: number;
  /** What sounded instead (MIDI), when wrong. */
  heard?: number;
}

/**
 * One expected note (tab steps, scales, string-by-string checks). The note's *odd* harmonics must be
 * there (so the octave above cannot pass for it), the octave below must not be (its odd harmonics
 * would be), and no neighbour a semitone or two away may be clearly stronger. `before`, when given,
 * is the spectrum just before the pluck: only energy that is new counts (earlier notes ring on).
 */
export function verifyNote(
  spec: Float64Array,
  sr: number,
  midi: number,
  options: { leniency?: Leniency; a4Hz?: number } = {},
): NoteCheck {
  const t = LENIENCY[options.leniency ?? 'standard'];
  const hz = (m: number) => midiHz(m, options.a4Hz ?? 440);
  const ev = (m: number, others: number[]) => {
    const e = uniqueEvidence(spec, sr, hz(m), others.map(hz), 5000, 6).evidence;
    return Number.isNaN(e) ? 0 : e;
  };
  const own = ev(midi, [midi + 12]); // odd harmonics only
  const below = ev(midi - 12, [midi]); // the octave below's odd harmonics
  const above = ev(midi + 12, []);
  let heard: number | undefined;
  let best = 0;
  for (const d of [-1, 1, -2, 2]) {
    const e = ev(midi + d, [midi]);
    if (e > best) {
      best = e;
      heard = midi + d;
    }
  }
  // Leakage next to loud partials is tens of times weaker than a real note: thresholds are relative
  // to the strongest candidate as well as absolute.
  const strongest = Math.max(own, below, above, best);
  const threshold = Math.max(t.present, SINGLE_RELATIVE * strongest);
  const score = own / threshold;
  if (below >= threshold && below >= 0.15 * own)
    return { ok: false, state: 'wrong', score, heard: midi - 12 };
  if (best >= threshold && best >= t.neighbour * own)
    return { ok: false, state: 'wrong', score, heard: heard! };
  if (score >= 1) return { ok: true, state: 'present', score };
  if (above >= threshold) return { ok: false, state: 'wrong', score, heard: midi + 12 };
  return { ok: false, state: score >= t.weak ? 'weak' : 'missing', score };
}
