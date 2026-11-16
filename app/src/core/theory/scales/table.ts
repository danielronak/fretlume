/** Scale table (docs/specs/03-theory-content.md §3). */

export interface ScaleDef {
  id: string;
  name: string;
  aliases: string[];
  degrees: string[];
  /** Which CAGED window family fits: decided by the third above the tonic. */
  third: 'major' | 'minor';
  tags: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
}

const s = (
  id: string,
  name: string,
  degrees: string,
  options: { aliases?: string[]; tags?: string[]; difficulty?: ScaleDef['difficulty'] } = {},
): ScaleDef => {
  const list = degrees.split(' ');
  const hasMajorThird = list.includes('3');
  const hasMinorThird = list.includes('b3') || list.includes('#2');
  return {
    id,
    name,
    aliases: options.aliases ?? [],
    degrees: list,
    third: !hasMajorThird && hasMinorThird ? 'minor' : 'major',
    tags: options.tags ?? [],
    difficulty: options.difficulty ?? 3,
  };
};

export const SCALES: ScaleDef[] = [
  s('major', 'major', '1 2 3 4 5 6 7', {
    aliases: ['ionian', 'major scale', 'do re mi'],
    tags: ['happy', 'bright', 'pop', 'country', 'folk'],
    difficulty: 2,
  }),
  s('minor', 'natural minor', '1 2 b3 4 5 b6 b7', {
    aliases: ['aeolian', 'minor', 'minor scale'],
    tags: ['sad', 'dark', 'rock', 'metal', 'pop'],
    difficulty: 2,
  }),
  s('minor-pentatonic', 'minor pentatonic', '1 b3 4 5 b7', {
    aliases: ['pentatonic minor', 'minor pent', 'pentatonic'],
    tags: ['rock', 'blues', 'bluesy', 'easy', 'solo', 'lead'],
    difficulty: 1,
  }),
  s('major-pentatonic', 'major pentatonic', '1 2 3 5 6', {
    aliases: ['pentatonic major', 'major pent', 'country scale'],
    tags: ['happy', 'country', 'folk', 'easy', 'solo', 'bright'],
    difficulty: 1,
  }),
  s('blues', 'blues', '1 b3 4 b5 5 b7', {
    aliases: ['minor blues', 'blues scale', 'bluesy'],
    tags: ['blues', 'bluesy', 'rock', 'gritty', 'solo', 'lead'],
    difficulty: 2,
  }),
  s('major-blues', 'major blues', '1 2 b3 3 5 6', {
    aliases: ['country blues'],
    tags: ['blues', 'bluesy', 'country', 'happy'],
    difficulty: 3,
  }),
  s('dorian', 'Dorian', '1 2 b3 4 5 6 b7', {
    aliases: ['dorian mode'],
    tags: ['jazzy', 'funky', 'soul', 'mellow', 'modal'],
  }),
  s('phrygian', 'Phrygian', '1 b2 b3 4 5 b6 b7', {
    aliases: ['phrygian mode'],
    tags: ['spanish', 'dark', 'metal', 'tense', 'modal'],
  }),
  s('lydian', 'Lydian', '1 2 3 #4 5 6 7', {
    aliases: ['lydian mode'],
    tags: ['dreamy', 'bright', 'floating', 'cinematic', 'modal'],
  }),
  s('mixolydian', 'Mixolydian', '1 2 3 4 5 6 b7', {
    aliases: ['mixolydian mode', 'dominant scale'],
    tags: ['bluesy', 'rock', 'funky', 'country', 'modal'],
  }),
  s('locrian', 'Locrian', '1 b2 b3 4 b5 b6 b7', {
    aliases: ['locrian mode'],
    tags: ['dark', 'tense', 'metal', 'unstable', 'modal'],
    difficulty: 4,
  }),
  s('harmonic-minor', 'harmonic minor', '1 2 b3 4 5 b6 7', {
    aliases: ['harmonic'],
    tags: ['classical', 'dark', 'eastern', 'spanish', 'metal', 'dramatic'],
  }),
  s('melodic-minor', 'melodic minor', '1 2 b3 4 5 6 7', {
    aliases: ['jazz minor'],
    tags: ['jazzy', 'jazz', 'smooth', 'dark'],
    difficulty: 4,
  }),
  s('phrygian-dominant', 'Phrygian dominant', '1 b2 3 4 5 b6 b7', {
    aliases: ['spanish gypsy', 'freygish', 'hijaz'],
    tags: ['spanish', 'eastern', 'flamenco', 'metal', 'exotic'],
    difficulty: 4,
  }),
  s('lydian-dominant', 'Lydian dominant', '1 2 3 #4 5 6 b7', {
    aliases: ['overtone scale', 'lydian b7'],
    tags: ['jazzy', 'jazz', 'fusion', 'bright'],
    difficulty: 4,
  }),
  s('altered', 'altered', '1 b2 #2 3 b5 #5 b7', {
    aliases: ['super locrian', 'altered dominant', 'diminished whole tone'],
    tags: ['jazzy', 'jazz', 'tense', 'outside'],
    difficulty: 5,
  }),
  s('whole-tone', 'whole tone', '1 2 3 #4 #5 b7', {
    aliases: ['wholetone'],
    tags: ['dreamy', 'strange', 'floating', 'jazz'],
    difficulty: 4,
  }),
  s('diminished-hw', 'diminished (half-whole)', '1 b2 b3 3 #4 5 6 b7', {
    aliases: ['half whole diminished', 'dominant diminished', 'octatonic'],
    tags: ['jazzy', 'jazz', 'tense', 'spooky'],
    difficulty: 5,
  }),
  s('diminished-wh', 'diminished (whole-half)', '1 2 b3 4 b5 b6 6 7', {
    aliases: ['whole half diminished', 'octatonic'],
    tags: ['tense', 'spooky', 'jazz', 'dark'],
    difficulty: 5,
  }),
  s('bebop-dominant', 'bebop dominant', '1 2 3 4 5 6 b7 7', {
    aliases: ['bebop'],
    tags: ['jazzy', 'jazz', 'swing'],
    difficulty: 5,
  }),
  s('harmonic-major', 'harmonic major', '1 2 3 4 5 b6 7', {
    aliases: [],
    tags: ['exotic', 'dramatic', 'jazz'],
    difficulty: 5,
  }),
  s('hungarian-minor', 'Hungarian minor', '1 2 b3 #4 5 b6 7', {
    aliases: ['gypsy minor', 'double harmonic minor'],
    tags: ['eastern', 'exotic', 'dark', 'dramatic'],
    difficulty: 5,
  }),
];

const BY_ID = new Map(SCALES.map((scale) => [scale.id, scale]));

export function scaleDef(id: string): ScaleDef {
  const scale = BY_ID.get(id);
  if (!scale) throw new Error(`unknown scale "${id}"`);
  return scale;
}
