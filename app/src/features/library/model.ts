/**
 * Library routes and item details: pure functions, no React.
 * URLs look like /library/chord/C/maj, /library/scale/Fs/minor-pentatonic, /library/key/Bb/major.
 * Roots use a letter plus "s" (sharp) or "b" (flat) so they survive hash routing; types are
 * URI-encoded ("6/9" → "6%2F9").
 */
import {
  CAGED_CHORD_QUALITIES,
  CHORD_QUALITIES,
  chordName,
  chordQuality,
  chordSymbol,
} from '@core/theory/chords/index';
import { spellDegree } from '@core/theory/degrees';
import { buildKey, relativeKey, scalesForQuality } from '@core/theory/keys';
import {
  ARPEGGIO_QUALITIES,
  libraryItem,
  type LibraryItem,
  type LibraryKind,
} from '@core/theory/library/index';
import { mod, noteName, parseNote, spelledPc, tonicSpelling } from '@core/theory/pitch';
import { scaleDef, scaleName, scaleNoteNames, SCALES } from '@core/theory/scales/index';
import { TRIAD_QUALITIES, triadName, type TriadQuality } from '@core/theory/triads';
import type { PitchClass } from '@core/theory/types';

export const LIBRARY_KINDS: LibraryKind[] = ['chord', 'scale', 'triad', 'key', 'arpeggio'];

export const DEFAULT_TYPE: Record<LibraryKind, string> = {
  chord: 'maj',
  scale: 'major',
  triad: 'maj',
  key: 'major',
  arpeggio: 'maj7',
};

export interface TypeOption {
  id: string;
  /** "major seventh", "minor pentatonic". */
  name: string;
}

export function typeOptions(kind: LibraryKind): TypeOption[] {
  switch (kind) {
    case 'chord':
      return CHORD_QUALITIES.map((q) => ({ id: q.id, name: q.name }));
    case 'scale':
      return SCALES.map((s) => ({ id: s.id, name: s.name }));
    case 'triad':
      return (Object.keys(TRIAD_QUALITIES) as TriadQuality[]).map((id) => ({
        id,
        name: TRIAD_QUALITIES[id].name,
      }));
    case 'key':
      return [
        { id: 'major', name: 'major' },
        { id: 'minor', name: 'minor' },
      ];
    case 'arpeggio':
      return ARPEGGIO_QUALITIES.map((id) => ({ id, name: chordQuality(id).name }));
  }
}

export function isValidType(kind: LibraryKind, typeId: string): boolean {
  return typeOptions(kind).some((option) => option.id === typeId);
}

export function isLibraryKind(value: string | undefined): value is LibraryKind {
  return LIBRARY_KINDS.includes(value as LibraryKind);
}

/** "C", "Fs", "Bb": the usual spelling of the root, made safe for URLs. */
export function rootSlug(root: PitchClass): string {
  return noteName(tonicSpelling(root, 'major')).replace('#', 's');
}

/** Accepts "C", "Fs", "F#", "Bb", "bb" (case-insensitive letter). Null if not a note. */
export function parseRootSlug(slug: string | undefined): PitchClass | null {
  if (!slug) return null;
  const match = /^([A-Ga-g])(s|#|b)?$/.exec(slug);
  if (!match?.[1]) return null;
  const accidental = match[2] === 's' || match[2] === '#' ? '#' : match[2] === 'b' ? 'b' : '';
  const note = parseNote(match[1].toUpperCase() + accidental);
  return note ? spelledPc(note) : null;
}

export function libraryPath(kind: LibraryKind, root: PitchClass, typeId: string): string {
  return `/library/${kind}/${rootSlug(root)}/${encodeURIComponent(typeId)}`;
}

export function itemPath(item: Pick<LibraryItem, 'kind' | 'root' | 'typeId'>): string {
  return libraryPath(item.kind, item.root, item.typeId);
}

export function itemId(kind: LibraryKind, root: PitchClass, typeId: string): string {
  return `${kind}-${mod(root, 12)}-${typeId}`;
}

export interface ItemDetails {
  id: string;
  title: string;
  symbol?: string;
  /** Spelled notes in order. */
  notes: string[];
  /** Degrees ("1 b3 5") or, for keys, roman numerals. */
  formula: string[];
}

function tonic(root: PitchClass, third: 'major' | 'minor' | 'none') {
  return tonicSpelling(root, third === 'minor' ? 'minor' : 'major');
}

export function itemDetails(kind: LibraryKind, root: PitchClass, typeId: string): ItemDetails {
  const id = itemId(kind, root, typeId);
  switch (kind) {
    case 'chord':
    case 'arpeggio': {
      const quality = chordQuality(typeId);
      const spelled = tonic(root, quality.third);
      return {
        id,
        title: kind === 'chord' ? chordName(root, quality) : `${chordName(root, quality)} arpeggio`,
        symbol: chordSymbol(root, quality),
        notes: quality.degrees.map((d) => spellDegree(spelled, d)),
        formula: quality.degrees,
      };
    }
    case 'scale': {
      const scale = scaleDef(typeId);
      return {
        id,
        // "C major" alone reads as the chord; say "scale".
        title: scaleName(root, scale) + (typeId === 'major' ? ' scale' : ''),
        notes: scaleNoteNames(root, scale),
        formula: scale.degrees,
      };
    }
    case 'triad': {
      const def = TRIAD_QUALITIES[typeId as TriadQuality];
      const spelled = tonicSpelling(root, def.third);
      return {
        id,
        title: triadName(root, typeId as TriadQuality),
        notes: def.degrees.map((d) => spellDegree(spelled, d)),
        formula: [...def.degrees],
      };
    }
    case 'key': {
      const key = buildKey(root, typeId as 'major' | 'minor');
      return {
        id,
        title: `Key of ${key.name}`,
        notes: key.notes,
        formula: key.triads.map((chord) => chord.numeral),
      };
    }
  }
}

export interface RelatedLink {
  path: string;
  label: string;
}

/** Items worth visiting next from this one. */
export function relatedItems(kind: LibraryKind, root: PitchClass, typeId: string): RelatedLink[] {
  const link = (k: LibraryKind, r: PitchClass, t: string): RelatedLink | null => {
    const item = libraryItem(itemId(k, r, t));
    return item ? { path: itemPath(item), label: itemDetails(k, r, t).title } : null;
  };
  const out: (RelatedLink | null)[] = [];
  switch (kind) {
    case 'chord':
      if ((ARPEGGIO_QUALITIES as readonly string[]).includes(typeId))
        out.push(link('arpeggio', root, typeId));
      if (typeId in TRIAD_QUALITIES) out.push(link('triad', root, typeId));
      for (const scaleId of scalesForQuality(typeId).slice(0, 3))
        out.push(link('scale', root, scaleId));
      break;
    case 'arpeggio':
      out.push(link('chord', root, typeId));
      for (const scaleId of scalesForQuality(typeId).slice(0, 2))
        out.push(link('scale', root, scaleId));
      break;
    case 'triad':
      out.push(link('chord', root, typeId), link('arpeggio', root, typeId));
      break;
    case 'scale':
      if (typeId === 'major' || typeId === 'minor') out.push(link('key', root, typeId));
      if (typeId === 'major') out.push(link('scale', mod(root - 3, 12), 'minor'));
      if (typeId === 'minor') out.push(link('scale', mod(root + 3, 12), 'major'));
      if (typeId === 'minor-pentatonic') {
        out.push(
          link('scale', root, 'blues'),
          link('scale', mod(root + 3, 12), 'major-pentatonic'),
        );
      }
      if (typeId === 'major-pentatonic')
        out.push(link('scale', mod(root - 3, 12), 'minor-pentatonic'));
      out.push(link('chord', root, scaleDef(typeId).third === 'minor' ? 'min' : 'maj'));
      break;
    case 'key': {
      const mode = typeId as 'major' | 'minor';
      const relative = relativeKey({ tonic: root, mode });
      out.push(
        link('scale', root, mode),
        link('key', relative.tonic, relative.mode),
        link('key', root, mode === 'major' ? 'minor' : 'major'),
      );
      break;
    }
  }
  return out.filter((entry): entry is RelatedLink => entry !== null);
}

export const hasCagedChordShapes = (typeId: string): boolean =>
  (CAGED_CHORD_QUALITIES as readonly string[]).includes(typeId);

/** "E+12" → "E": the form letter of a position id; other ids pass through. */
export const groupBase = (groupId: string): string => groupId.split('+')[0] ?? groupId;

/** Distinct chip ids for a shape's groups, in neck order ("C", "A", "G", "E", "D" — not "C+12"). */
export function chipGroups(groupIds: readonly string[]): string[] {
  const seen: string[] = [];
  for (const id of groupIds) {
    const base = groupBase(id);
    if (!seen.includes(base)) seen.push(base);
  }
  return seen;
}

/** Group ids to highlight for the selected chips. */
export function activeGroupIds(groupIds: readonly string[], chips: readonly string[]): string[] {
  if (chips.length === 0) return [];
  return groupIds.filter((id) => chips.includes(groupBase(id)));
}
