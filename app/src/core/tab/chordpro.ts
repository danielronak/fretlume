/**
 * Chord sheets (phase 5 task 5.6): ChordPro ("[Am]words", {title: …} directives) and plain sheets
 * with chord lines above the words. Each chord becomes a bar with its symbol and a strum on every
 * beat, using the first library voicing; words are not kept (the tab model has no lyrics). Pure.
 */
import { chordVoicings } from '../theory/chords/index';
import { parseChordSymbol } from '../theory/chords/parse';
import { TabParseError } from './ascii';
import { STANDARD_TAB_TUNING, TPQ, type Bar, type Beat, type Tab, type TabNote } from './model';

const DIRECTIVE = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i;

/** Every token of the line is a chord (or a bar line / repeat mark): a chord line. */
function chordLine(line: string): string[] | null {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  const chords = tokens.filter((t) => !/^(\||\/|%|-|x\d+|\(?x\d+\)?)$/i.test(t));
  if (chords.length === 0) return null;
  return chords.every((c) => parseChordSymbol(c) !== null) ? chords : null;
}

function strum(symbol: string): TabNote[] {
  const parsed = parseChordSymbol(symbol);
  if (!parsed) return [];
  const voicing = chordVoicings(parsed.root, parsed.qualityId, { limit: 1 })[0];
  if (!voicing) return [];
  return voicing.frets.map((fret, i) => ({ string: i + 1, fret })).filter((n) => n.fret >= 0);
}

export function looksLikeChordPro(text: string): boolean {
  return (
    /\[[A-G][^\]\s]{0,10}\]/.test(text) || /^\s*\{\s*(title|t|start_of_\w+)\s*[:}]/im.test(text)
  );
}

export function fromChordPro(text: string, id: string): Tab {
  const meta: Record<string, string> = {};
  const symbols: string[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    if (line.trim().startsWith('#')) continue;
    const directive = DIRECTIVE.exec(line.trim());
    if (directive) {
      const key = directive[1]!.toLowerCase();
      if (directive[2] !== undefined) meta[key === 't' ? 'title' : key] ??= directive[2];
      continue;
    }
    const bracketed = [...line.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]!.trim());
    if (bracketed.length) {
      symbols.push(...bracketed.filter((s) => parseChordSymbol(s) !== null));
      continue;
    }
    const chords = chordLine(line);
    if (chords) symbols.push(...chords);
  }
  if (symbols.length === 0)
    throw new TabParseError(
      'noChords',
      'No chords found: expected “[Am]” in the words or a line of chords.',
    );

  const time = /^(\d+)\/(\d+)$/.exec(meta.time ?? '');
  const timeSig: [number, number] =
    time && [1, 2, 4, 8, 16].includes(Number(time[2]))
      ? [Math.min(16, Math.max(1, Number(time[1]))), Number(time[2])]
      : [4, 4];
  const beatTicks = (TPQ * 4) / timeSig[1];
  const bars: Bar[] = symbols.slice(0, 2000).map((symbol) => {
    const notes = strum(symbol);
    const beats: Beat[] = Array.from({ length: timeSig[0] }, () =>
      notes.length
        ? { durTicks: beatTicks, notes: notes.map((n) => ({ ...n })) }
        : { durTicks: beatTicks, notes: [], rest: true },
    );
    return { beats, chordSymbol: symbol.slice(0, 16) };
  });
  const tempo = Number(meta.tempo);
  const capo = Number(meta.capo);
  return {
    id,
    title: (meta.title ?? 'Imported chords').slice(0, 120),
    tuning: [...STANDARD_TAB_TUNING],
    capo: Number.isInteger(capo) && capo >= 0 && capo <= 12 ? capo : 0,
    tempoBpm: tempo >= 20 && tempo <= 400 ? Math.round(tempo) : 90,
    timeSig,
    tracks: [{ bars }],
  };
}
