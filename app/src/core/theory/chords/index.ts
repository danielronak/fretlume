/** Chord voicings for a root and quality: seeds, moved shapes, and generated shapes. */
import { degreePc } from '../degrees';
import { parseNote, spelledPc, tonicSpelling, noteName, mod } from '../pitch';
import { makeMarks, makeShape } from '../shape';
import { pcAt, STANDARD_TUNING } from '../tuning';
import type { PitchClass, Shape, Tuning } from '../types';
import { inferFingering } from './fingering';
import { generateVoicings } from './generate';
import { chordQuality, type ChordQuality } from './qualities';
import { SEED_VOICINGS, type SeedVoicing } from './seeds';
import {
  CAGED_FORMS,
  formatFrets,
  fretSpan,
  mutedStrings,
  shiftFrets,
  soundingPositions,
  type CagedForm,
  type Voicing,
} from './voicing';

export * from './qualities';
export * from './voicing';
export { inferFingering } from './fingering';
export { identifyChord } from './identify';
export { SEED_VOICINGS } from './seeds';

export interface ChordOptions {
  tuning?: Tuning;
  /** Highest fret a voicing may use. Default 15. */
  maxFret?: number;
  /** Maximum number of voicings returned. Default 8. */
  limit?: number;
}

const STANDARD_STEPS = [5, 5, 5, 4, 5]; // semitones between adjacent strings, low → high

/** Seeds are shapes for standard intervals; they also fit any tuning that is standard shifted. */
export function hasStandardIntervals(tuning: Tuning): boolean {
  if (tuning.strings.length !== 6) return false;
  const lowToHigh = [...tuning.strings].reverse();
  return STANDARD_STEPS.every((step, i) => (lowToHigh[i + 1] ?? 0) - (lowToHigh[i] ?? 0) === step);
}

/** Chord symbol such as "C", "F#m7", "Bbmaj7". Roots are spelled the way that key is usually written. */
export function chordSymbol(root: PitchClass, quality: ChordQuality): string {
  const kind = quality.third === 'minor' ? 'minor' : 'major';
  return noteName(tonicSpelling(root, kind)) + quality.suffix;
}

export function chordName(root: PitchClass, quality: ChordQuality): string {
  const kind = quality.third === 'minor' ? 'minor' : 'major';
  return `${noteName(tonicSpelling(root, kind))} ${quality.name}`;
}

export function chordPcs(root: PitchClass, quality: ChordQuality): PitchClass[] {
  return quality.degrees.map((degree) => degreePc(root, degree));
}

/** Pitch class of a seed's root in standard tuning. */
function seedRootPc(seed: SeedVoicing): PitchClass {
  const parsed = parseNote(seed.root);
  if (!parsed) throw new Error(`bad seed root ${seed.root}`);
  return spelledPc(parsed);
}

function voicingFromFrets(
  frets: number[],
  source: Voicing['source'],
  extra: Partial<Voicing> = {},
): Voicing | null {
  const fingering = extra.fingers ? { fingers: extra.fingers } : inferFingering(frets);
  if (!fingering) return null;
  const voicing: Voicing = { frets, fingers: fingering.fingers, source };
  const barre = 'barre' in fingering ? fingering.barre : inferFingering(frets)?.barre;
  if (barre) voicing.barre = barre;
  if (extra.form) voicing.form = extra.form;
  return voicing;
}

/** Lowest fretted fret, or 0 when the shape is all open strings. */
const position = (voicing: Voicing): number => {
  const fretted = voicing.frets.filter((fret) => fret > 0);
  return fretted.length ? Math.min(...fretted) : 0;
};

/**
 * Voicings of a chord, nearest the nut first. Hand-authored shapes come first at each position,
 * then shapes obtained by moving them up the neck, then generated ones to fill gaps.
 */
export function chordVoicings(
  root: PitchClass,
  qualityId: string,
  options: ChordOptions = {},
): Voicing[] {
  const tuning = options.tuning ?? STANDARD_TUNING;
  const maxFret = options.maxFret ?? 15;
  const limit = options.limit ?? 8;
  const quality = chordQuality(qualityId);
  const seen = new Set<string>();
  const out: Voicing[] = [];
  const add = (voicing: Voicing | null) => {
    if (!voicing) return;
    const key = formatFrets(voicing.frets);
    if (seen.has(key) || Math.max(...voicing.frets) > maxFret) return;
    seen.add(key);
    out.push(voicing);
  };

  if (hasStandardIntervals(tuning)) {
    // Seeds are written for E-A-D-G-B-E; a uniformly shifted tuning shifts every seed's root with it.
    const offset = mod((tuning.strings[0] ?? 64) - 64, 12);
    for (const seed of SEED_VOICINGS) {
      if (seed.quality !== qualityId) continue;
      const shift = mod(root - seedRootPc(seed) - offset, 12);
      if (shift === 0) {
        add(
          voicingFromFrets(seed.frets, 'seed', {
            fingers: seed.fingers,
            ...(seed.form ? { form: seed.form } : {}),
          }),
        );
      } else if (seed.movable) {
        add(
          voicingFromFrets(
            shiftFrets(seed.movedFrets ?? seed.frets, shift),
            'moved',
            seed.form ? { form: seed.form } : {},
          ),
        );
      }
    }
  }

  // Hand-authored and moved shapes first, nearest the nut first. Generated shapes only top the
  // list up to four, because they are less idiomatic; the UI can label them as generated.
  out.sort((a, b) => position(a) - position(b) || fretSpan(a.frets) - fretSpan(b.frets));
  const authored = out.length;
  const target = Math.min(limit, Math.max(authored, 4));
  if (authored < target) {
    for (const voicing of generateVoicings(root, quality, { tuning, maxFret })) {
      if (out.length >= target) break;
      // Skip generated shapes that sit in the same place as an authored one.
      if (out.slice(0, authored).some((v) => Math.abs(position(v) - position(voicing)) < 2))
        continue;
      add(voicing);
    }
  }
  return out.slice(0, limit);
}

/** Turn a voicing into the shared mark model. */
export function voicingToShape(
  root: PitchClass,
  qualityId: string,
  voicing: Voicing,
  tuning: Tuning = STANDARD_TUNING,
): Shape {
  const quality = chordQuality(qualityId);
  const spelledRoot = tonicSpelling(root, quality.third === 'minor' ? 'minor' : 'major');
  const groups = voicing.form ? [voicing.form] : [];
  const marks = makeMarks(
    tuning,
    { root: spelledRoot, degrees: quality.degrees },
    soundingPositions(voicing.frets).map((p) => {
      const finger = voicing.fingers?.[p.string - 1];
      return { ...p, groups, ...(finger !== undefined ? { finger } : {}) };
    }),
  );
  return makeShape({
    id: `chord:${root}:${qualityId}:${formatFrets(voicing.frets)}`,
    kind: 'chord',
    title: chordName(root, quality),
    root,
    marks,
    muted: mutedStrings(voicing.frets),
    groups: voicing.form ? [{ id: voicing.form, label: `${voicing.form} shape` }] : [],
  });
}

/** Qualities that have all five CAGED forms authored. */
export const CAGED_CHORD_QUALITIES = ['maj', 'min', '7', 'maj7', 'm7'] as const;

export interface CagedChord {
  form: CagedForm;
  voicing: Voicing;
}

/**
 * The five CAGED forms of a chord along the neck, nearest the nut first
 * (C major: C shape open, A shape at fret 3, G at 5, E at 8, D at 10).
 */
export function cagedChordSet(
  root: PitchClass,
  qualityId: string,
  options: ChordOptions = {},
): CagedChord[] {
  const tuning = options.tuning ?? STANDARD_TUNING;
  const maxFret = options.maxFret ?? 15;
  if (!hasStandardIntervals(tuning)) return [];
  const offset = mod((tuning.strings[0] ?? 64) - 64, 12);
  const out: CagedChord[] = [];
  for (const form of CAGED_FORMS) {
    const seed = SEED_VOICINGS.find((s) => s.quality === qualityId && s.form === form);
    if (!seed) continue;
    const shift = mod(root - seedRootPc(seed) - offset, 12);
    const voicing =
      shift === 0
        ? voicingFromFrets(seed.frets, 'seed', { fingers: seed.fingers, form })
        : voicingFromFrets(shiftFrets(seed.movedFrets ?? seed.frets, shift), 'moved', { form });
    if (voicing && Math.max(...voicing.frets) <= maxFret) out.push({ form, voicing });
  }
  return out.sort((a, b) => position(a.voicing) - position(b.voicing));
}

/** All five forms on one neck, each note tagged with its form — the "5 shapes across the fretboard" view. */
export function cagedChordShape(
  root: PitchClass,
  qualityId: string,
  options: ChordOptions = {},
): Shape {
  const tuning = options.tuning ?? STANDARD_TUNING;
  const quality = chordQuality(qualityId);
  const set = cagedChordSet(root, qualityId, options);
  const spelledRoot = tonicSpelling(root, quality.third === 'minor' ? 'minor' : 'major');
  const marks = set.flatMap(({ form, voicing }) =>
    makeMarks(
      tuning,
      { root: spelledRoot, degrees: quality.degrees },
      soundingPositions(voicing.frets).map((p) => ({ ...p, groups: [form] })),
    ),
  );
  return makeShape({
    id: `chord-caged:${root}:${qualityId}`,
    kind: 'chord',
    title: chordName(root, quality),
    root,
    marks: mergeByPosition(marks),
    groups: set.map(({ form }) => ({ id: form, label: `${form} shape` })),
  });
}

function mergeByPosition(marks: ReturnType<typeof makeMarks>) {
  const map = new Map<string, (typeof marks)[number]>();
  for (const mark of marks) {
    const key = `${mark.string}:${mark.fret}`;
    const existing = map.get(key);
    if (existing) {
      for (const g of mark.groups) if (!existing.groups.includes(g)) existing.groups.push(g);
    } else map.set(key, { ...mark, groups: [...mark.groups] });
  }
  return [...map.values()];
}

/** Does this voicing really spell the chord? Used by tests and by the generator. */
export function voicingIsValid(
  root: PitchClass,
  quality: ChordQuality,
  frets: readonly number[],
  tuning: Tuning = STANDARD_TUNING,
): { ok: boolean; reason?: string } {
  const allowed = new Set(chordPcs(root, quality));
  const sounding = soundingPositions(frets);
  if (sounding.length < 2) return { ok: false, reason: 'fewer than two notes' };
  const pcs = sounding.map((p) => pcAt(tuning, p));
  if (pcs.some((pc) => !allowed.has(pc))) return { ok: false, reason: 'contains a non-chord tone' };
  for (const degree of quality.essential) {
    if (!pcs.includes(degreePc(root, degree))) return { ok: false, reason: `missing ${degree}` };
  }
  return { ok: true };
}
