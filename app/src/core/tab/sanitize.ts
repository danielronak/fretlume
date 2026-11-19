/**
 * Tabs from outside (IndexedDB, JSON files, backups) are re-validated here before the app uses them:
 * anything malformed is dropped or clamped, and the result is in canonical form (notes sorted by
 * string, one note per string, `rest: true` only on empty beats). Pure.
 */
import { MAX_FRET, TECHNIQUES, TPQ, type Bar, type Beat, type Tab, type TabNote } from './model';

export const TAB_LIMITS = {
  titleChars: 120,
  bars: 2000,
  beatsPerBar: 64,
  minTicks: TPQ / 8,
  maxTicks: TPQ * 8,
  chordChars: 16,
} as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function cleanNote(raw: unknown, strings: number): TabNote | null {
  if (!isObj(raw)) return null;
  const string = num(raw.string);
  const fret = num(raw.fret);
  if (string === null || fret === null) return null;
  if (!Number.isInteger(string) || string < 1 || string > strings) return null;
  if (!Number.isInteger(fret) || fret < 0 || fret > MAX_FRET) return null;
  const note: TabNote = { string, fret };
  const tech = raw.tech;
  if (typeof tech === 'string' && (TECHNIQUES as readonly string[]).includes(tech)) {
    note.tech = tech as TabNote['tech'] & string;
    if (tech === 'b' || tech === 'r') {
      const semis = num(raw.bendSemis);
      note.bendSemis = semis !== null && semis >= 0.5 && semis <= 4 ? Math.round(semis * 2) / 2 : 2;
    }
  }
  return note;
}

function cleanBeat(raw: unknown, strings: number): Beat | null {
  if (!isObj(raw)) return null;
  const ticks = num(raw.durTicks);
  if (ticks === null) return null;
  const durTicks = Math.round(Math.max(TAB_LIMITS.minTicks, Math.min(TAB_LIMITS.maxTicks, ticks)));
  const byString = new Map<number, TabNote>();
  for (const n of Array.isArray(raw.notes) ? raw.notes : []) {
    const note = cleanNote(n, strings);
    if (note && !byString.has(note.string)) byString.set(note.string, note);
  }
  const notes = [...byString.values()].sort((a, b) => a.string - b.string);
  return notes.length ? { durTicks, notes } : { durTicks, notes, rest: true };
}

function cleanBar(raw: unknown, strings: number): Bar | null {
  if (!isObj(raw) || !Array.isArray(raw.beats)) return null;
  const beats = raw.beats
    .slice(0, TAB_LIMITS.beatsPerBar)
    .map((b) => cleanBeat(b, strings))
    .filter((b): b is Beat => b !== null);
  if (beats.length === 0) return null;
  const chord =
    typeof raw.chordSymbol === 'string'
      ? raw.chordSymbol.trim().slice(0, TAB_LIMITS.chordChars)
      : '';
  return chord ? { beats, chordSymbol: chord } : { beats };
}

/** A safe, canonical copy of a stored or imported tab, or null when it is not a tab at all. */
export function sanitizeTab(raw: unknown, idFallback?: string): Tab | null {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : idFallback;
  if (!id) return null;
  const tuning = Array.isArray(raw.tuning)
    ? raw.tuning.map(num).filter((m): m is number => m !== null && m >= 16 && m <= 100)
    : [];
  if (tuning.length < 4 || tuning.length > 8 || !Array.isArray(raw.tracks)) return null;
  const strings = tuning.length;
  const tracks = raw.tracks
    .map((t) =>
      isObj(t) && Array.isArray(t.bars)
        ? {
            bars: t.bars
              .slice(0, TAB_LIMITS.bars)
              .map((b) => cleanBar(b, strings))
              .filter((b): b is Bar => b !== null),
          }
        : null,
    )
    .filter((t): t is { bars: Bar[] } => t !== null && t.bars.length > 0);
  if (tracks.length === 0) return null;
  // Plain spaces only (files bring non-breaking spaces and line breaks).
  const titleText = typeof raw.title === 'string' ? raw.title.replace(/\s+/g, ' ').trim() : '';
  const title = titleText ? titleText.slice(0, TAB_LIMITS.titleChars) : 'Untitled tab';
  const capo = num(raw.capo);
  const tempo = num(raw.tempoBpm);
  const sig = Array.isArray(raw.timeSig) ? raw.timeSig.map(num) : [];
  const sigOk =
    sig.length === 2 &&
    Number.isInteger(sig[0]) &&
    sig[0]! >= 1 &&
    sig[0]! <= 16 &&
    [1, 2, 4, 8, 16].includes(sig[1]!);
  const tab: Tab = {
    id,
    title,
    tuning: tuning.map(Math.round),
    capo: capo !== null ? Math.round(Math.max(0, Math.min(12, capo))) : 0,
    tempoBpm: tempo !== null ? Math.round(Math.max(20, Math.min(400, tempo))) : 90,
    timeSig: sigOk ? [sig[0]!, sig[1]!] : [4, 4],
    tracks,
  };
  const updatedAt = num(raw.updatedAt);
  if (updatedAt !== null) tab.updatedAt = updatedAt;
  return tab;
}
