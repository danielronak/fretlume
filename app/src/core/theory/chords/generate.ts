/**
 * Voicing generator for chords that have no (or too few) hand-authored shapes
 * (docs/specs/03-theory-content.md §2): enumerate playable fingerings inside a four-fret
 * window, keep those that really spell the chord with the root in the bass, rank by comfort.
 */
import { degreePc } from '../degrees';
import { mod } from '../pitch';
import { openMidi, STANDARD_TUNING } from '../tuning';
import type { PitchClass, Tuning } from '../types';
import { inferFingering } from './fingering';
import type { ChordQuality } from './qualities';
import { formatFrets, type Voicing } from './voicing';

interface GenerateOptions {
  tuning?: Tuning;
  maxFret?: number;
  /** Pitch class that must be the lowest note. Defaults to the root. */
  bass?: PitchClass;
}

const WINDOW = 4; // frets under the hand

function cost(
  frets: number[],
  fingerCount: number,
  barreLength: number,
  has5th: boolean,
  sharedFingers: number,
): number {
  const sounding = frets.filter((f) => f >= 0);
  const fretted = frets.filter((f) => f > 0);
  const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
  // Muted strings above the bass (inside or on top of the shape) are harder to strum cleanly.
  const lowest = frets.length - 1 - [...frets].reverse().findIndex((f) => f >= 0);
  const mutedInside = frets.slice(0, lowest).filter((f) => f < 0).length;
  return (
    span * 1.2 +
    fingerCount * 0.8 +
    barreLength * 0.25 +
    mutedInside * 2.5 +
    sharedFingers * 1.5 +
    (has5th ? 0 : 0.6) +
    (6 - sounding.length) * 0.7
  );
}

export function generateVoicings(
  root: PitchClass,
  quality: ChordQuality,
  options: GenerateOptions = {},
): Voicing[] {
  const tuning = options.tuning ?? STANDARD_TUNING;
  const maxFret = options.maxFret ?? 15;
  const bass = options.bass ?? root;
  const stringCount = tuning.strings.length;
  const tones = new Set(quality.degrees.map((d) => degreePc(root, d)));
  const essential = quality.essential.map((d) => degreePc(root, d));
  const fifth = degreePc(root, '5');
  const minNotes = quality.degrees.length >= 4 ? 4 : 3;
  const found = new Map<string, { voicing: Voicing; cost: number; low: number }>();

  for (let low = 0; low <= maxFret - WINDOW + 1; low++) {
    const windowLow = Math.max(low, 1);
    const windowHigh = windowLow + WINDOW - 1;
    // Options per string: frets in the window that are chord tones, an open string if it is one, or mute.
    const optionsPerString: number[][] = [];
    for (let s = 1; s <= stringCount; s++) {
      const open = openMidi(tuning, s);
      const list: number[] = [-1];
      if (low <= 2 && tones.has(mod(open, 12))) list.push(0);
      for (let fret = windowLow; fret <= windowHigh; fret++) {
        if (tones.has(mod(open + fret, 12))) list.push(fret);
      }
      optionsPerString.push(list);
    }

    const frets: number[] = new Array<number>(stringCount).fill(-1);
    const walk = (index: number) => {
      if (index < 0) {
        consider();
        return;
      }
      for (const option of optionsPerString[index] ?? [-1]) {
        frets[index] = option;
        walk(index - 1);
      }
    };

    const consider = () => {
      // Sounding strings must be one block: low strings may be muted, and at most the string
      // right above the bass (the usual "skip a string" jazz shape).
      const sounding = frets.flatMap((f, i) => (f >= 0 ? [i] : []));
      if (sounding.length < minNotes) return;
      const bassIndex = Math.max(...sounding);
      const top = Math.min(...sounding);
      for (let i = top; i < bassIndex; i++) {
        if ((frets[i] ?? -1) < 0 && i !== bassIndex - 1) return;
      }
      if (top > 1) return; // leave at most the top string unused
      // The lowest *pitch* must be the bass note (an open string can sound below a fretted one).
      const midis = sounding.map((i) => openMidi(tuning, i + 1) + (frets[i] ?? 0));
      const lowestMidi = Math.min(...midis);
      if (mod(lowestMidi, 12) !== bass) return;
      if (midis[sounding.indexOf(bassIndex)] !== lowestMidi) return;
      const pcs = midis.map((m) => mod(m, 12));
      if (essential.some((pc) => !pcs.includes(pc))) return;
      if (!frets.some((f) => f > 0)) return; // all-open shapes are covered by seeds
      const fingering = inferFingering(frets);
      if (!fingering) return;
      const key = formatFrets(frets);
      if (found.has(key)) return;
      const fingerCount = new Set(fingering.fingers.filter((f) => f !== 0)).size;
      const barreLength = fingering.barre
        ? fingering.barre.fromString - fingering.barre.toString
        : 0;
      // Notes that share a finger other than the index barre (small second barres) are awkward.
      const counts = new Map<number, number>();
      for (const f of fingering.fingers)
        if (f !== 0 && f !== 1 && f !== 'T') counts.set(f, (counts.get(f) ?? 0) + 1);
      const sharedFingers = [...counts.values()].reduce((sum, n) => sum + (n - 1), 0);
      const voicing: Voicing = {
        frets: [...frets],
        fingers: fingering.fingers,
        source: 'generated',
      };
      if (fingering.barre) voicing.barre = fingering.barre;
      const lowFret = Math.min(...frets.filter((f) => f > 0));
      found.set(key, {
        voicing,
        cost: cost(frets, fingerCount, barreLength, pcs.includes(fifth), sharedFingers),
        low: lowFret,
      });
    };

    walk(stringCount - 1);
  }

  // Best shape in each neighbourhood of the neck first, so results spread along the neck.
  const ranked = [...found.values()].sort((a, b) => a.cost - b.cost);
  const picked: typeof ranked = [];
  for (const candidate of ranked) {
    const crowd = picked.filter((p) => Math.abs(p.low - candidate.low) < 3).length;
    if (crowd < 1) picked.push(candidate);
  }
  for (const candidate of ranked) {
    if (picked.length >= 12) break;
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  return picked.map((p) => p.voicing);
}
