/**
 * Strum timing evidence (refines docs/specs/02-audio.md §4.4 for doubled notes). In a strum every
 * string is plucked at its own moment. Notes with unique harmonics show when they were plucked; a line
 * through those times (string number → time) predicts when the others were. A note whose harmonics are
 * all shared with another note (an octave doubling) is then judged by whether the energy at its
 * partials jumps at its predicted pluck time. Pure.
 */
import { magnitude } from './spectrum';
import { midiHz } from './salience';
import { uniqueHarmonics, type NoteVerdict } from './verify';

const N = 1024;
/** Bench hook: when set, refineByTiming records its measurements here. */
export let DEBUG:
  { string: number; midi: number; ratio: number; t: number; slope: number }[] | null = null;
export const setStrumDebug = (on: boolean) => {
  DEBUG = on ? [] : null;
};
const HOP = 64;

/** Energy at the first harmonics of f0 in each frame (max over the nearest bins). */
function partialEnergy(
  frames: Float64Array[],
  sr: number,
  f0: number,
  harmonics: number[],
): number[] {
  const binHz = sr / N;
  return frames.map((spec) => {
    let e = 0;
    for (const h of harmonics) {
      const k = Math.round((h * f0) / binHz);
      if (k < 1 || k >= spec.length - 1) continue;
      e += Math.max(spec[k - 1]!, spec[k]!, spec[k + 1]!);
    }
    return e;
  });
}

export function strumFrames(
  signal: ArrayLike<number>,
  startSample: number,
  endSample: number,
): Float64Array[] {
  const frames: Float64Array[] = [];
  for (let s = startSample - N / 2; s <= endSample; s += HOP) frames.push(magnitude(signal, s, N));
  return frames;
}

/**
 * Frame indices where `e` rises by at least `ratio` and by at least `share` of its peak (so the
 * broadband click of another string's pick does not count), as local maxima ≥ 4 frames apart.
 */
function rises(e: number[], ratio: number, floor: number, share: number): number[] {
  const out: number[] = [];
  const peak = Math.max(...e);
  const score = e.map((_, i) =>
    i >= 3 && i < e.length - 6 ? e[i + 6]! / Math.max(e[i - 3]!, floor) : 0,
  );
  for (let i = 3; i < e.length - 6; i++) {
    const rise = e[i + 6]! - e[i - 3]!;
    if (score[i]! < ratio || rise < floor || rise < share * peak) continue;
    if (score[i]! >= score[i - 1]! && score[i]! >= (score[i + 1] ?? 0)) {
      if (out.length && i - out[out.length - 1]! < 4) {
        if (score[i]! > score[out[out.length - 1]!]!) out[out.length - 1] = i;
      } else out.push(i);
    }
  }
  return out;
}

/**
 * Refine `unsure` notes (all harmonics shared) with strum timing. `frames` cover the strum (see
 * strumFrames). For each unsure note, the notes it shares harmonics with ("partners") are timed from
 * their own unique partials; if the unsure note's partials also rise at a moment ≥ `apartS` away from
 * every partner's pluck, its string was played. Without partner timing the note stays unsure.
 */
export function refineByTiming(
  perNote: NoteVerdict[],
  frames: Float64Array[],
  sr: number,
  options: { a4Hz?: number; jump?: number; apartS?: number; minSpreadS?: number } = {},
): NoteVerdict[] {
  if (!perNote.some((n) => n.state === 'unsure')) return perNote;
  const a4 = options.a4Hz ?? 440;
  const jump = options.jump ?? 1.2;
  const apart = Math.round((options.apartS ?? 0.014) / (HOP / sr));
  const binHz = sr / N;
  const pitches = [...new Set(perNote.map((n) => n.midi))];
  const hz = (m: number) => midiHz(m, a4);
  // Noise floor of partial energy: the quietest frame of the whole strum, summed over 4 partials.
  let floor = Infinity;
  for (const f of frames) {
    let s = 0;
    for (let k = 1; k < f.length; k += 8) s += f[k]!;
    floor = Math.min(floor, (s / (f.length / 8)) * 4);
  }
  floor = Math.max(floor * 3, 1e-6);
  const pluckOf = new Map<number, number[]>();
  for (const m of pitches) {
    const own = uniqueHarmonics(hz(m), pitches.filter((q) => q !== m).map(hz), binHz, 4000).slice(
      0,
      3,
    );
    if (own.length === 0) continue;
    pluckOf.set(m, rises(partialEnergy(frames, sr, hz(m), own), 1.6, floor, 0.3));
  }
  // A fast strum blurs the plucks together: then timing cannot tell, and doubled notes stay unsure.
  const firsts = [...pluckOf.entries()]
    .filter(([, t]) => t.length > 0)
    .map(([m, t]) => ({ string: perNote.find((n) => n.midi === m)!.string, i: t[0]! }));
  if (firsts.length < 2) return perNote;
  const strings = firsts.map((f) => f.string);
  const span = Math.max(...strings) - Math.min(...strings);
  const frames_ = Math.max(...firsts.map((f) => f.i)) - Math.min(...firsts.map((f) => f.i));
  if (span === 0 || (frames_ * (HOP / sr)) / span < (options.minSpreadS ?? 0.022)) return perNote;
  return perNote.map((n) => {
    if (n.state !== 'unsure') return n;
    const f0 = hz(n.midi);
    const harmonics = [1, 2, 3, 4].filter((h) => h * f0 < 4000);
    const partners = pitches.filter((q) => {
      if (q === n.midi) return false;
      const g = hz(q);
      return harmonics.some((h) => {
        const r = Math.round((h * f0) / g);
        return r >= 1 && Math.abs(1200 * Math.log2((h * f0) / (r * g))) < 40;
      });
    });
    const partnerTimes = partners.flatMap((q) => pluckOf.get(q) ?? []);
    if (partners.some((q) => !pluckOf.get(q)?.length)) return n; // a partner cannot be timed
    const own = rises(partialEnergy(frames, sr, f0, harmonics), jump, floor, 0.12);
    const separate = own.filter((i) => partnerTimes.every((p) => Math.abs(i - p) >= apart));
    if (DEBUG)
      DEBUG.push({
        string: n.string,
        midi: n.midi,
        ratio: separate.length,
        t: own.length,
        slope: partnerTimes.length,
      });
    return separate.length > 0
      ? { ...n, state: 'present' as const, score: 1 }
      : { ...n, state: 'missing' as const, score: 0.5 };
  });
}
