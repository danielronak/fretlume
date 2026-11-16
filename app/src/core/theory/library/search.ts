/**
 * Library search that understands how players describe things: "sad chords in G",
 * "bluesy scale A", "easy F", "Am7", "what has C E G" (docs/specs/03-theory-content.md §6).
 * A small deterministic scorer, not a general text index (DECISIONS D-011).
 */
import { CHORD_QUALITIES } from '../chords/index';
import { degreePc } from '../degrees';
import { parseNote, spelledPc } from '../pitch';
import type { PitchClass } from '../types';
import { libraryCatalogue, type LibraryItem, type LibraryKind } from './catalogue';

export interface ParsedQuery {
  kind?: LibraryKind;
  root?: PitchClass;
  /** Exact chord named by a symbol such as "Am7". */
  chord?: { root: PitchClass; qualityId: string };
  /** Notes listed after "what has …". */
  notes?: PitchClass[];
  /** Only items a beginner can play. */
  easy: boolean;
  /** Remaining descriptive words. */
  terms: string[];
}

const KIND_WORDS: Record<string, LibraryKind> = {
  chord: 'chord',
  chords: 'chord',
  scale: 'scale',
  scales: 'scale',
  mode: 'scale',
  modes: 'scale',
  triad: 'triad',
  triads: 'triad',
  key: 'key',
  keys: 'key',
  arpeggio: 'arpeggio',
  arpeggios: 'arpeggio',
  arp: 'arpeggio',
};

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'in',
  'of',
  'on',
  'for',
  'to',
  'me',
  'my',
  'show',
  'find',
  'give',
  'play',
  'with',
  'and',
  'that',
  'this',
  'sound',
  'sounds',
  'sounding',
  'like',
  'some',
  'something',
  'what',
  'is',
  'are',
  'has',
  'have',
  'how',
  'do',
  'i',
  'shape',
  'shapes',
  'guitar',
  'please',
  'notes',
  'note',
  'string',
  'strings',
  'top',
  'three',
]);

/** Everyday words → the tags used in the tables. */
const SYNONYMS: Record<string, string> = {
  flamenco: 'spanish',
  melancholy: 'sad',
  melancholic: 'sad',
  moody: 'dark',
  cheerful: 'happy',
  joyful: 'happy',
  scary: 'spooky',
  creepy: 'spooky',
  exotic: 'eastern',
  oriental: 'eastern',
  arabic: 'eastern',
  dreamlike: 'dreamy',
  spacey: 'dreamy',
  heavy: 'metal',
  seventh: '7',
  '7th': '7',
  ninth: '9',
  '9th': '9',
  sixth: '6',
  '6th': '6',
  sus: 'suspended',
  dom: 'dominant',
  dim: 'diminished',
  aug: 'augmented',
  min: 'minor',
  maj: 'major',
  pent: 'pentatonic',
  penta: 'pentatonic',
};

const EASY_WORDS = new Set(['easy', 'beginner', 'beginners', 'simple', 'first', 'basic']);
const NOTE_QUERY = /^(what (has|is|chord has|chord is)|which chord has|chord with|notes?)\b/;

/** Chord suffixes and aliases, longest first, for reading symbols like "f#m7b5". */
const SUFFIXES: { text: string; qualityId: string; caseSensitive: boolean }[] =
  CHORD_QUALITIES.flatMap((quality) => [
    { text: quality.suffix, qualityId: quality.id, caseSensitive: false },
    ...quality.aliases
      .filter((alias) => !alias.includes(' '))
      .map((alias) => ({
        text: alias,
        qualityId: quality.id,
        // "M7" (major) and "m7" (minor) differ only by case.
        caseSensitive: /^M\d*$/.test(alias),
      })),
  ]).filter((s) => s.text.length > 0);

function parseSymbol(token: string): { root: PitchClass; qualityId: string } | null {
  const match = /^([A-Ga-g])([#b]?)(.+)$/.exec(token);
  if (!match?.[1] || !match[3]) return null;
  const note = parseNote(match[1].toUpperCase() + (match[2] ?? ''));
  if (!note) return null;
  const rest = match[3];
  const exact = SUFFIXES.find((s) => s.caseSensitive && s.text === rest);
  const loose = SUFFIXES.find(
    (s) => !s.caseSensitive && s.text.toLowerCase() === rest.toLowerCase(),
  );
  const found = exact ?? loose;
  return found ? { root: spelledPc(note), qualityId: found.qualityId } : null;
}

function parseRoot(token: string): PitchClass | null {
  if (!/^[A-Ga-g][#b]?$/.test(token)) return null;
  const note = parseNote(token[0]!.toUpperCase() + token.slice(1));
  return note ? spelledPc(note) : null;
}

export function parseQuery(text: string): ParsedQuery {
  const cleaned = text
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .replace(/([A-Ga-g])\s+sharp\b/gi, '$1#')
    .replace(/([A-Ga-g])\s+flat\b/gi, '$1b')
    .trim();
  const query: ParsedQuery = { easy: false, terms: [] };
  const tokens = cleaned.split(/[\s,]+/).filter(Boolean);

  if (NOTE_QUERY.test(cleaned.toLowerCase())) {
    const notes = tokens.map(parseRoot).filter((pc): pc is PitchClass => pc !== null);
    if (notes.length >= 2) {
      query.notes = notes;
      query.kind = 'chord';
      return query;
    }
  }
  if (/\btop (three|3) strings\b/i.test(cleaned)) query.kind = 'triad';

  tokens.forEach((token, index) => {
    const lower = token.toLowerCase();
    const kind = KIND_WORDS[lower];
    if (kind) {
      query.kind ??= kind;
      return;
    }
    if (EASY_WORDS.has(lower)) {
      query.easy = true;
      return;
    }
    const symbol = parseSymbol(token);
    if (symbol && query.chord === undefined) {
      query.chord = symbol;
      query.root = symbol.root;
      return;
    }
    const root = parseRoot(token);
    if (root !== null && query.root === undefined) {
      // A lone "a" is usually the article; it is a note after "in"/"of"/"key", at the end,
      // or right before a quality word ("A minor").
      const previous = tokens[index - 1]?.toLowerCase();
      const next = tokens[index + 1]?.toLowerCase();
      const isArticle =
        lower === 'a' &&
        !(
          previous === 'in' ||
          previous === 'of' ||
          previous === 'key' ||
          index === tokens.length - 1 ||
          token === 'A' ||
          (next !== undefined && /^(m|min|minor|maj|major|sharp|flat|\d)/.test(next))
        );
      if (!isArticle) {
        query.root = root;
        return;
      }
    }
    if (STOP_WORDS.has(lower)) return;
    query.terms.push(SYNONYMS[lower] ?? lower);
  });
  return query;
}

/** 0 = no match … 3 = the term is one of the item's own name words. */
function termScore(term: string, item: LibraryItem): number {
  if (item.nameWords.includes(term)) return 3;
  if (item.aliases.some((alias) => alias === term || alias.split(' ').includes(term))) return 2.6;
  if (item.tags.includes(term)) return 2.4;
  if (term.length >= 3) {
    const all = [...item.nameWords, ...item.aliases.flatMap((a) => a.split(' ')), ...item.tags];
    if (all.some((word) => word.startsWith(term))) return 1.5;
    if (all.some((word) => withinOneEdit(word, term))) return 1;
  }
  return 0;
}

/** True when the words differ by at most one inserted, deleted or changed letter. */
export function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a.length < 4) return a === b;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const KIND_ORDER: LibraryKind[] = ['chord', 'scale', 'triad', 'key', 'arpeggio'];

function chordsWithNotes(notes: PitchClass[]): LibraryItem[] {
  const pcs = [...new Set(notes)];
  const ranked: { item: LibraryItem; rank: number }[] = [];
  for (const item of libraryCatalogue()) {
    if (item.kind !== 'chord' || !pcs.includes(item.root)) continue;
    const quality = CHORD_QUALITIES.find((q) => q.id === item.typeId);
    if (!quality) continue;
    const tones = quality.degrees.map((d) => degreePc(item.root, d));
    if (pcs.some((pc) => !tones.includes(pc))) continue;
    if (quality.essential.some((d) => !pcs.includes(degreePc(item.root, d)))) continue;
    const missing = tones.filter((pc) => !pcs.includes(pc)).length;
    ranked.push({
      item,
      rank: missing * 3 + quality.difficulty + (item.root === notes[0] ? 0 : 4),
    });
  }
  return ranked.sort((a, b) => a.rank - b.rank).map((r) => r.item);
}

/** Search the library. An empty query returns nothing. */
export function searchLibrary(text: string, limit = 20): LibraryItem[] {
  if (!text.trim()) return [];
  const query = parseQuery(text);
  if (query.notes) return chordsWithNotes(query.notes).slice(0, limit);

  const phrase = query.terms.join(' ');
  const scored: { item: LibraryItem; score: number }[] = [];
  for (const item of libraryCatalogue()) {
    if (query.kind && item.kind !== query.kind) continue;
    if (query.root !== undefined && item.root !== query.root) continue;
    if (query.easy && item.difficulty > 2) continue;

    let score = 0;
    let matchedAll = true;
    const matchedNameWords = new Set<string>();
    for (const term of query.terms) {
      const s = termScore(term, item);
      if (s === 0) matchedAll = false;
      if (item.nameWords.includes(term)) matchedNameWords.add(term);
      score += s;
    }
    if (!matchedAll) continue;

    // An exact chord symbol ("Am7") beats everything; the same chord as an arpeggio comes next.
    if (query.chord) {
      if (item.typeId !== query.chord.qualityId) {
        if (query.terms.length === 0) continue;
      } else if (item.kind === 'chord') score += 100;
      else if (item.kind === 'arpeggio') score += 40;
    }
    // The words name this item exactly ("minor" → natural minor, "pentatonic" → minor pentatonic).
    if (phrase && (item.nameWords.join(' ') === phrase || item.aliases.includes(phrase)))
      score += 5;
    // Prefer the item whose name has nothing left unexplained ("major" → major, not major pentatonic).
    // Only when the query names something; mood-only queries ("sad", "metal scale") rank by ease.
    if (matchedNameWords.size > 0) score -= 0.4 * (item.nameWords.length - matchedNameWords.size);
    score -= 0.1 * item.difficulty;
    // Chords first when nothing else decides: a bare "Bb" most likely means the chord.
    score -= 0.25 * KIND_ORDER.indexOf(item.kind);
    scored.push({ item, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}
