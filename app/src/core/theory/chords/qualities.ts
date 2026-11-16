/** Chord quality table (docs/specs/03-theory-content.md §2). */

export interface ChordQuality {
  id: string;
  /** Appended to the root name: "" → "C", "m7" → "Cm7". */
  suffix: string;
  /** Spoken name: "major seventh". */
  name: string;
  /** Other ways people write the suffix, for search. */
  aliases: string[];
  /** Formula as degrees above the root. */
  degrees: string[];
  /** Degrees a voicing must contain; the rest may be dropped (usually the fifth). */
  essential: string[];
  /** Third type decides which CAGED family the chord belongs to. */
  third: 'major' | 'minor' | 'none';
  tags: string[];
  /** 1 (first chords) … 5 (advanced colours). */
  difficulty: 1 | 2 | 3 | 4 | 5;
}

const q = (
  id: string,
  suffix: string,
  name: string,
  degrees: string,
  options: {
    aliases?: string[];
    essential?: string;
    tags?: string[];
    difficulty?: ChordQuality['difficulty'];
  } = {},
): ChordQuality => {
  const list = degrees.split(' ');
  return {
    id,
    suffix,
    name,
    aliases: options.aliases ?? [],
    degrees: list,
    essential: options.essential ? options.essential.split(' ') : list,
    third: list.includes('3') ? 'major' : list.includes('b3') ? 'minor' : 'none',
    tags: options.tags ?? [],
    difficulty: options.difficulty ?? 3,
  };
};

export const CHORD_QUALITIES: ChordQuality[] = [
  q('maj', '', 'major', '1 3 5', {
    aliases: ['M', 'maj', 'major'],
    tags: ['happy', 'bright', 'campfire', 'pop', 'rock', 'country'],
    difficulty: 1,
  }),
  q('min', 'm', 'minor', '1 b3 5', {
    aliases: ['min', 'minor', '-'],
    tags: ['sad', 'dark', 'campfire', 'pop', 'rock'],
    difficulty: 1,
  }),
  q('5', '5', 'power chord', '1 5', {
    aliases: ['power', 'no3'],
    tags: ['rock', 'metal', 'punk', 'heavy'],
    difficulty: 1,
  }),
  q('sus2', 'sus2', 'suspended second', '1 2 5', {
    aliases: ['sus 2'],
    tags: ['open', 'dreamy', 'airy', 'pop'],
    difficulty: 2,
  }),
  q('sus4', 'sus4', 'suspended fourth', '1 4 5', {
    aliases: ['sus', 'sus 4'],
    tags: ['tense', 'open', 'pop', 'rock'],
    difficulty: 2,
  }),
  q('7', '7', 'dominant seventh', '1 3 5 b7', {
    aliases: ['dom7', 'dominant'],
    essential: '1 3 b7',
    tags: ['bluesy', 'blues', 'funky', 'country', 'tense'],
    difficulty: 2,
  }),
  q('maj7', 'maj7', 'major seventh', '1 3 5 7', {
    aliases: ['M7', 'Δ', 'Δ7', 'major 7'],
    essential: '1 3 7',
    tags: ['jazzy', 'jazz', 'dreamy', 'soft', 'bossa'],
    difficulty: 2,
  }),
  q('m7', 'm7', 'minor seventh', '1 b3 5 b7', {
    aliases: ['min7', '-7', 'minor 7'],
    essential: '1 b3 b7',
    tags: ['jazzy', 'jazz', 'soul', 'funky', 'mellow', 'sad'],
    difficulty: 2,
  }),
  q('m7b5', 'm7b5', 'half-diminished', '1 b3 b5 b7', {
    aliases: ['ø', 'ø7', 'half diminished', 'min7b5'],
    tags: ['jazzy', 'jazz', 'dark', 'tense'],
    difficulty: 4,
  }),
  q('dim', 'dim', 'diminished', '1 b3 b5', {
    aliases: ['°', 'diminished'],
    tags: ['tense', 'dark', 'spooky'],
    difficulty: 3,
  }),
  q('dim7', 'dim7', 'diminished seventh', '1 b3 b5 bb7', {
    aliases: ['°7', 'diminished 7'],
    tags: ['tense', 'dark', 'spooky', 'jazzy', 'jazz'],
    difficulty: 4,
  }),
  q('aug', 'aug', 'augmented', '1 3 #5', {
    aliases: ['+', 'augmented'],
    tags: ['tense', 'dreamy', 'strange'],
    difficulty: 3,
  }),
  q('6', '6', 'major sixth', '1 3 5 6', {
    aliases: ['M6', 'major 6'],
    essential: '1 3 6',
    tags: ['happy', 'jazzy', 'swing', 'country'],
    difficulty: 3,
  }),
  q('m6', 'm6', 'minor sixth', '1 b3 5 6', {
    aliases: ['min6', 'minor 6'],
    essential: '1 b3 6',
    tags: ['jazzy', 'dark', 'gypsy', 'bossa'],
    difficulty: 3,
  }),
  q('add9', 'add9', 'added ninth', '1 3 5 9', {
    aliases: ['add2', 'add 9'],
    essential: '1 3 9',
    tags: ['dreamy', 'bright', 'pop', 'open'],
    difficulty: 2,
  }),
  q('madd9', 'madd9', 'minor added ninth', '1 b3 5 9', {
    aliases: ['m(add9)', 'minor add 9'],
    essential: '1 b3 9',
    tags: ['sad', 'dreamy', 'dark', 'cinematic'],
    difficulty: 3,
  }),
  q('9', '9', 'dominant ninth', '1 3 5 b7 9', {
    aliases: ['dom9'],
    essential: '1 3 b7 9',
    tags: ['funky', 'funk', 'bluesy', 'jazzy', 'soul'],
    difficulty: 4,
  }),
  q('maj9', 'maj9', 'major ninth', '1 3 5 7 9', {
    aliases: ['M9', 'Δ9', 'major 9'],
    essential: '1 3 7 9',
    tags: ['jazzy', 'jazz', 'dreamy', 'soft', 'neo-soul'],
    difficulty: 4,
  }),
  q('m9', 'm9', 'minor ninth', '1 b3 5 b7 9', {
    aliases: ['min9', '-9', 'minor 9'],
    essential: '1 b3 b7 9',
    tags: ['jazzy', 'jazz', 'soul', 'neo-soul', 'mellow'],
    difficulty: 4,
  }),
  q('11', '11', 'dominant eleventh', '1 3 5 b7 9 11', {
    aliases: ['dom11'],
    essential: '1 b7 11',
    tags: ['funky', 'jazzy', 'gospel', 'open'],
    difficulty: 5,
  }),
  q('13', '13', 'dominant thirteenth', '1 3 5 b7 9 13', {
    aliases: ['dom13'],
    essential: '1 3 b7 13',
    tags: ['jazzy', 'jazz', 'funky', 'bluesy'],
    difficulty: 5,
  }),
  q('7sus4', '7sus4', 'dominant seventh suspended fourth', '1 4 5 b7', {
    aliases: ['7sus', '7 sus 4'],
    essential: '1 4 b7',
    tags: ['tense', 'funky', 'gospel', 'open'],
    difficulty: 3,
  }),
  q('7#9', '7#9', 'dominant seventh sharp nine', '1 3 5 b7 #9', {
    aliases: ['7(#9)', 'hendrix'],
    essential: '1 3 b7 #9',
    tags: ['bluesy', 'funky', 'rock', 'gritty', 'tense'],
    difficulty: 4,
  }),
  q('7b9', '7b9', 'dominant seventh flat nine', '1 3 5 b7 b9', {
    aliases: ['7(b9)'],
    essential: '1 3 b7 b9',
    tags: ['jazzy', 'jazz', 'tense', 'spanish', 'dark'],
    difficulty: 5,
  }),
  q('mMaj7', 'mMaj7', 'minor major seventh', '1 b3 5 7', {
    aliases: ['m(maj7)', 'minMaj7', '-Δ7', 'minor major 7'],
    essential: '1 b3 7',
    tags: ['dark', 'tense', 'spooky', 'jazzy', 'cinematic'],
    difficulty: 4,
  }),
  q('6/9', '6/9', 'six-nine', '1 3 5 6 9', {
    aliases: ['69', '6add9'],
    essential: '1 3 6 9',
    tags: ['jazzy', 'jazz', 'bossa', 'happy', 'soft'],
    difficulty: 4,
  }),
];

const BY_ID = new Map(CHORD_QUALITIES.map((quality) => [quality.id, quality]));

export function chordQuality(id: string): ChordQuality {
  const quality = BY_ID.get(id);
  if (!quality) throw new Error(`unknown chord quality "${id}"`);
  return quality;
}
