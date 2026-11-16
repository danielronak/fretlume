/** Keys and harmony: diatonic chords, roman numerals, roles, progressions (docs/specs/03 §5). */
import { CHORD_QUALITIES, chordSymbol, type ChordQuality } from './chords/index';
import { degreePc, spellDegree } from './degrees';
import { mod, noteName, tonicSpelling } from './pitch';
import type { PitchClass } from './types';

export type KeyMode = 'major' | 'minor' | 'harmonic-minor' | 'melodic-minor';
export type HarmonicRole = 'tonic' | 'predominant' | 'dominant';

const MODE_DEGREES: Record<KeyMode, string[]> = {
  major: ['1', '2', '3', '4', '5', '6', '7'],
  minor: ['1', '2', 'b3', '4', '5', 'b6', 'b7'],
  'harmonic-minor': ['1', '2', 'b3', '4', '5', 'b6', '7'],
  'melodic-minor': ['1', '2', 'b3', '4', '5', '6', '7'],
};

export const KEY_MODE_NAME: Record<KeyMode, string> = {
  major: 'major',
  minor: 'minor',
  'harmonic-minor': 'harmonic minor',
  'melodic-minor': 'melodic minor',
};

// Function of each scale step. Major: I iii vi rest, ii IV prepare, V vii° pull home.
const ROLES: Record<KeyMode, HarmonicRole[]> = {
  major: ['tonic', 'predominant', 'tonic', 'predominant', 'dominant', 'tonic', 'dominant'],
  minor: ['tonic', 'predominant', 'tonic', 'predominant', 'dominant', 'predominant', 'dominant'],
  'harmonic-minor': [
    'tonic',
    'predominant',
    'tonic',
    'predominant',
    'dominant',
    'predominant',
    'dominant',
  ],
  'melodic-minor': [
    'tonic',
    'predominant',
    'tonic',
    'predominant',
    'dominant',
    'tonic',
    'dominant',
  ],
};

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;

export interface DiatonicChord {
  /** 1–7. */
  step: number;
  root: PitchClass;
  quality: ChordQuality;
  /** "ii", "V7", "vii°". */
  numeral: string;
  /** "Dm", "G7". */
  symbol: string;
  role: HarmonicRole;
}

export interface Key {
  tonic: PitchClass;
  mode: KeyMode;
  /** "C major", "A minor". */
  name: string;
  /** Scale notes spelled for the key. */
  notes: string[];
  triads: DiatonicChord[];
  sevenths: DiatonicChord[];
}

/** Chords that only arise inside harmonic and melodic minor keys; not part of the chord library. */
const KEY_ONLY_QUALITIES: ChordQuality[] = [
  {
    id: 'maj7#5',
    suffix: 'maj7#5',
    name: 'augmented major seventh',
    aliases: ['+maj7', 'maj7+'],
    degrees: ['1', '3', '#5', '7'],
    essential: ['1', '3', '#5', '7'],
    third: 'major',
    tags: ['tense', 'jazz'],
    difficulty: 5,
  },
];

function qualityOf(intervals: number[]): ChordQuality {
  const wanted = [...intervals].sort((a, b) => a - b).join(',');
  const found = [...CHORD_QUALITIES, ...KEY_ONLY_QUALITIES].find(
    (q) =>
      q.degrees.length === intervals.length &&
      q.degrees
        .map((d) => mod(degreePc(0, d), 12))
        .sort((a, b) => a - b)
        .join(',') === wanted,
  );
  if (!found) throw new Error(`no chord quality for intervals ${wanted}`);
  return found;
}

function numeralFor(step: number, quality: ChordQuality): string {
  const base = NUMERALS[step - 1] ?? 'I';
  const lower = quality.third === 'minor';
  const text = lower ? base.toLowerCase() : base;
  switch (quality.id) {
    case 'maj':
    case 'min':
      return text;
    case 'dim':
      return `${text}°`;
    case 'aug':
      return `${text}+`;
    case 'm7b5':
      return `${text}ø7`;
    case 'dim7':
      return `${text}°7`;
    case 'm7':
      return `${text}7`;
    default:
      return text + quality.suffix;
  }
}

/** Build a key: its notes and the chords that belong to it. */
export function buildKey(tonic: PitchClass, mode: KeyMode = 'major'): Key {
  const degrees = MODE_DEGREES[mode];
  const spelledTonic = tonicSpelling(tonic, mode === 'major' ? 'major' : 'minor');
  const pcs = degrees.map((d) => degreePc(tonic, d));
  const stack = (size: number): DiatonicChord[] =>
    pcs.map((root, i) => {
      const intervals = Array.from({ length: size }, (_, n) =>
        mod((pcs[(i + 2 * n) % 7] ?? 0) - root, 12),
      );
      const quality = qualityOf(intervals);
      const rootName = spellDegree(spelledTonic, degrees[i] ?? '1');
      return {
        step: i + 1,
        root,
        quality,
        numeral: numeralFor(i + 1, quality),
        symbol: rootName + quality.suffix,
        role: ROLES[mode][i] ?? 'tonic',
      };
    });
  return {
    tonic,
    mode,
    name: `${noteName(spelledTonic)} ${KEY_MODE_NAME[mode]}`,
    notes: degrees.map((d) => spellDegree(spelledTonic, d)),
    triads: stack(3),
    sevenths: stack(4),
  };
}

/** The key with the same notes: C major ↔ A minor. */
export function relativeKey(key: Pick<Key, 'tonic' | 'mode'>): {
  tonic: PitchClass;
  mode: KeyMode;
} {
  return key.mode === 'major'
    ? { tonic: mod(key.tonic - 3, 12), mode: 'minor' }
    : { tonic: mod(key.tonic + 3, 12), mode: 'major' };
}

/** The key with the same tonic: C major ↔ C minor. */
export function parallelKey(key: Pick<Key, 'tonic' | 'mode'>): {
  tonic: PitchClass;
  mode: KeyMode;
} {
  return { tonic: key.tonic, mode: key.mode === 'major' ? 'minor' : 'major' };
}

export interface Progression {
  id: string;
  name: string;
  mode: 'major' | 'minor';
  /** Scale steps 1–7; a trailing "7" asks for the seventh chord: "5:7". */
  steps: string[];
  tags: string[];
}

export const PROGRESSIONS: Progression[] = [
  {
    id: 'I-IV-V',
    name: 'Three-chord song',
    mode: 'major',
    steps: ['1', '4', '5'],
    tags: ['folk', 'rock', 'country', 'campfire'],
  },
  {
    id: 'I-V-vi-IV',
    name: 'Four-chord pop',
    mode: 'major',
    steps: ['1', '5', '6', '4'],
    tags: ['pop', 'campfire'],
  },
  {
    id: 'vi-IV-I-V',
    name: 'Pop, minor start',
    mode: 'major',
    steps: ['6', '4', '1', '5'],
    tags: ['pop', 'sad'],
  },
  {
    id: 'I-vi-IV-V',
    name: 'Doo-wop',
    mode: 'major',
    steps: ['1', '6', '4', '5'],
    tags: ['oldies', 'pop'],
  },
  {
    id: 'ii-V-I',
    name: 'Two-five-one',
    mode: 'major',
    steps: ['2:7', '5:7', '1:7'],
    tags: ['jazz', 'jazzy'],
  },
  {
    id: 'I-IV-I-V',
    name: 'Country shuffle',
    mode: 'major',
    steps: ['1', '4', '1', '5'],
    tags: ['country', 'folk'],
  },
  {
    id: 'i-VII-VI-V',
    name: 'Andalusian cadence',
    mode: 'minor',
    steps: ['1', '7', '6', '5'],
    tags: ['spanish', 'flamenco', 'rock'],
  },
  {
    id: 'i-VI-III-VII',
    name: 'Minor pop',
    mode: 'minor',
    steps: ['1', '6', '3', '7'],
    tags: ['pop', 'rock', 'sad'],
  },
  {
    id: 'i-iv-v',
    name: 'Minor three-chord',
    mode: 'minor',
    steps: ['1', '4', '5'],
    tags: ['rock', 'folk', 'sad'],
  },
  {
    id: 'ii-V-i',
    name: 'Minor two-five-one',
    mode: 'minor',
    steps: ['2:7', '5:7', '1:7'],
    tags: ['jazz', 'jazzy'],
  },
];

/** Twelve-bar blues: one chord per bar, all dominant sevenths. */
export function twelveBarBlues(tonic: PitchClass): string[] {
  const seventh = CHORD_QUALITIES.find((q) => q.id === '7');
  if (!seventh) throw new Error('dominant seventh quality missing');
  const chord = (semitones: number) => chordSymbol(mod(tonic + semitones, 12), seventh);
  const [I, IV, V] = [chord(0), chord(5), chord(7)];
  return [I, I, I, I, IV, IV, I, I, V, IV, I, V] as string[];
}

/** Chords of a progression in a key. Minor progressions use the harmonic-minor V. */
export function progressionChords(tonic: PitchClass, progression: Progression): DiatonicChord[] {
  const key = buildKey(tonic, progression.mode);
  const harmonic = progression.mode === 'minor' ? buildKey(tonic, 'harmonic-minor') : key;
  return progression.steps.map((token) => {
    const [stepText, seventh] = token.split(':');
    const step = Number(stepText);
    // In minor keys the fifth step is normally major (raised leading note).
    const source = step === 5 ? harmonic : key;
    const chord = (seventh ? source.sevenths : source.triads)[step - 1];
    if (!chord) throw new Error(`bad progression step "${token}"`);
    return chord;
  });
}

export interface CapoSuggestion {
  capo: number;
  /** Key whose open chord shapes you finger with the capo on. */
  shapesOf: string;
}

const OPEN_FRIENDLY: Record<'major' | 'minor', PitchClass[]> = {
  major: [0, 7, 2, 9, 4], // C G D A E
  minor: [9, 4, 2], // Am Em Dm
};

/** Capo positions that let a key be played with familiar open shapes. */
export function capoSuggestions(
  tonic: PitchClass,
  mode: 'major' | 'minor',
  maxCapo = 7,
): CapoSuggestion[] {
  const out: CapoSuggestion[] = [];
  for (let capo = 0; capo <= maxCapo; capo++) {
    const shape = mod(tonic - capo, 12);
    if (OPEN_FRIENDLY[mode].includes(shape)) {
      out.push({ capo, shapesOf: `${noteName(tonicSpelling(shape, mode))} ${mode}` });
    }
  }
  return out;
}

/** Scales that fit over a chord of the key, most inside-sounding first (for jam mode). */
export function chordScaleChoices(chord: DiatonicChord, mode: KeyMode): string[] {
  if (mode === 'major') {
    const modes = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian'];
    const primary = modes[chord.step - 1] ?? 'major';
    const pentatonic = chord.quality.third === 'minor' ? 'minor-pentatonic' : 'major-pentatonic';
    return chord.quality.id === 'dim' || chord.quality.id === 'm7b5'
      ? [primary]
      : [primary, pentatonic];
  }
  return scalesForQuality(chord.quality.id);
}

/** Scale choices for a chord on its own, with no key context. */
export function scalesForQuality(qualityId: string): string[] {
  switch (qualityId) {
    case 'maj':
    case '6':
    case 'add9':
    case '6/9':
      return ['major-pentatonic', 'major', 'lydian'];
    case 'maj7':
    case 'maj9':
      return ['major', 'lydian', 'major-pentatonic'];
    case 'min':
    case 'm7':
    case 'm9':
    case 'madd9':
    case 'm6':
      return ['minor-pentatonic', 'dorian', 'minor'];
    case '7':
    case '9':
    case '13':
    case '11':
    case '7sus4':
      return ['mixolydian', 'blues', 'major-blues'];
    case '7#9':
    case '7b9':
      return ['altered', 'diminished-hw', 'blues'];
    case 'm7b5':
      return ['locrian'];
    case 'dim':
    case 'dim7':
      return ['diminished-wh'];
    case 'aug':
      return ['whole-tone'];
    case 'mMaj7':
      return ['melodic-minor', 'harmonic-minor'];
    case 'sus2':
    case 'sus4':
    case '5':
      return ['major-pentatonic', 'minor-pentatonic', 'mixolydian'];
    default:
      return ['major'];
  }
}
