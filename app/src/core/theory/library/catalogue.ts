/**
 * The library catalogue: every chord, scale, triad set, key and arpeggio the app can show,
 * with the names, aliases and tags that search uses (docs/specs/03-theory-content.md §6).
 * Generated from the theory tables; nothing here is hand-listed per key.
 */
import { CHORD_QUALITIES, chordName, chordSymbol, SEED_VOICINGS } from '../chords/index';
import { buildKey } from '../keys';
import { mod, noteName, parseNote, pcName, spelledPc, tonicSpelling } from '../pitch';
import { scaleName, SCALES } from '../scales/index';
import { TRIAD_QUALITIES, triadName, type TriadQuality } from '../triads';
import type { PitchClass } from '../types';

export type LibraryKind = 'chord' | 'scale' | 'triad' | 'key' | 'arpeggio';

export interface LibraryItem {
  /** Stable id, also used in links: "chord-0-maj7", "scale-9-minor-pentatonic". */
  id: string;
  kind: LibraryKind;
  root: PitchClass;
  /** Quality, scale or mode id within its kind. */
  typeId: string;
  /** Display title: "C major seventh", "A minor pentatonic". */
  title: string;
  /** Short form where one exists: "Cmaj7". */
  symbol?: string;
  /** Words of the type name, lowercased: ["major", "seventh"]. */
  nameWords: string[];
  /** Alternative names and spellings, lowercased. */
  aliases: string[];
  tags: string[];
  difficulty: number;
}

export const ARPEGGIO_QUALITIES = ['maj', 'min', '7', 'maj7', 'm7', 'm7b5', 'dim7', 'aug'] as const;

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9#/+°øδ-]+/)
    .filter(Boolean);

/** Roots that have a hand-authored open-position voicing, per quality. */
const OPEN_ROOTS = new Map<string, Set<PitchClass>>();
for (const seed of SEED_VOICINGS) {
  if (!seed.frets.includes(0)) continue;
  const parsed = parseNote(seed.root);
  if (!parsed) continue;
  const set = OPEN_ROOTS.get(seed.quality) ?? new Set<PitchClass>();
  set.add(spelledPc(parsed));
  OPEN_ROOTS.set(seed.quality, set);
}

function chordItems(): LibraryItem[] {
  const out: LibraryItem[] = [];
  for (let root = 0; root < 12; root++) {
    for (const quality of CHORD_QUALITIES) {
      const open = OPEN_ROOTS.get(quality.id)?.has(root) ?? false;
      out.push({
        id: `chord-${root}-${quality.id}`,
        kind: 'chord',
        root,
        typeId: quality.id,
        title: chordName(root, quality),
        symbol: chordSymbol(root, quality),
        nameWords: words(quality.name),
        aliases: [quality.suffix, ...quality.aliases].filter(Boolean).map((a) => a.toLowerCase()),
        tags: [...quality.tags, open ? 'open' : 'barre', 'chord'],
        // An open-position chord is easier than the same quality as a barre chord.
        difficulty: quality.difficulty + (open ? 0 : 1),
      });
    }
  }
  return out;
}

function scaleItems(): LibraryItem[] {
  const out: LibraryItem[] = [];
  for (let root = 0; root < 12; root++) {
    for (const scale of SCALES) {
      out.push({
        id: `scale-${root}-${scale.id}`,
        kind: 'scale',
        root,
        typeId: scale.id,
        title: scaleName(root, scale),
        nameWords: words(scale.name),
        aliases: scale.aliases.map((a) => a.toLowerCase()),
        tags: [...scale.tags, 'scale'],
        difficulty: scale.difficulty,
      });
    }
  }
  return out;
}

function triadItems(): LibraryItem[] {
  const out: LibraryItem[] = [];
  for (let root = 0; root < 12; root++) {
    for (const quality of Object.keys(TRIAD_QUALITIES) as TriadQuality[]) {
      const def = TRIAD_QUALITIES[quality];
      out.push({
        id: `triad-${root}-${quality}`,
        kind: 'triad',
        root,
        typeId: quality,
        title: triadName(root, quality),
        nameWords: words(def.name),
        aliases: ['triad', 'triads', 'inversions'],
        tags: ['triad', quality === 'maj' ? 'happy' : quality === 'min' ? 'sad' : 'tense'],
        difficulty: quality === 'maj' || quality === 'min' ? 3 : 4,
      });
    }
  }
  return out;
}

function keyItems(): LibraryItem[] {
  const out: LibraryItem[] = [];
  for (let root = 0; root < 12; root++) {
    for (const mode of ['major', 'minor'] as const) {
      const key = buildKey(root, mode);
      out.push({
        id: `key-${root}-${mode}`,
        kind: 'key',
        root,
        typeId: mode,
        title: `Key of ${key.name}`,
        nameWords: [mode],
        aliases: ['key', 'diatonic', 'chords in the key'],
        tags: ['key', 'harmony', mode === 'major' ? 'happy' : 'sad'],
        difficulty: 3,
      });
    }
  }
  return out;
}

function arpeggioItems(): LibraryItem[] {
  const out: LibraryItem[] = [];
  for (let root = 0; root < 12; root++) {
    for (const id of ARPEGGIO_QUALITIES) {
      const quality = CHORD_QUALITIES.find((q) => q.id === id);
      if (!quality) continue;
      out.push({
        id: `arpeggio-${root}-${id}`,
        kind: 'arpeggio',
        root,
        typeId: id,
        title: `${chordName(root, quality)} arpeggio`,
        symbol: chordSymbol(root, quality),
        nameWords: words(quality.name),
        aliases: ['arpeggio', 'arpeggios', quality.suffix.toLowerCase()].filter(Boolean),
        tags: ['arpeggio', 'lead', 'solo'],
        difficulty: Math.min(5, quality.difficulty + 2),
      });
    }
  }
  return out;
}

let cached: LibraryItem[] | null = null;

/** Every library item, in a stable order (chords, scales, triads, keys, arpeggios; C first). */
export function libraryCatalogue(): LibraryItem[] {
  cached ??= [...chordItems(), ...scaleItems(), ...triadItems(), ...keyItems(), ...arpeggioItems()];
  return cached;
}

export function libraryItem(id: string): LibraryItem | undefined {
  return libraryCatalogue().find((item) => item.id === id);
}

/** Both spellings of a root, lowercased: ["c#", "db"]. */
export function rootNames(pc: PitchClass): string[] {
  const names = new Set([
    pcName(pc, 'sharp'),
    pcName(pc, 'flat'),
    noteName(tonicSpelling(mod(pc, 12), 'major')),
  ]);
  return [...names].map((n) => n.toLowerCase());
}

export function catalogueCounts(): Record<LibraryKind, number> {
  const counts: Record<LibraryKind, number> = { chord: 0, scale: 0, triad: 0, key: 0, arpeggio: 0 };
  for (const item of libraryCatalogue()) counts[item.kind]++;
  return counts;
}
