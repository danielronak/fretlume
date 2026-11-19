/**
 * Tab editor state (phase 5 task 5.5): a cursor on (bar, beat, string), edits as pure functions,
 * undo/redo and a bar clipboard. Keyboard and touch both dispatch these actions. Pure.
 */
import { MAX_FRET, TPQ, type Bar, type Beat, type Tab, type Technique } from './model';

export interface Cursor {
  bar: number;
  beat: number;
  /** 1 = high e. */
  string: number;
}

export interface EditorState {
  tab: Tab;
  cursor: Cursor;
  past: Tab[];
  future: Tab[];
  clipboard: Bar | null;
  /** First digit of a two-digit fret, and when it was typed. */
  pending: { digit: number; tMs: number } | null;
}

export type EditAction =
  | { type: 'move'; beats?: number; strings?: number }
  | { type: 'moveBar'; bars: number }
  | { type: 'home' }
  | { type: 'end' }
  | { type: 'goto'; cursor: Cursor }
  | { type: 'digit'; digit: number; tMs: number }
  | { type: 'fret'; fret: number }
  | { type: 'clear' }
  | { type: 'tech'; tech: Technique }
  | { type: 'duration'; op: 'double' | 'halve' }
  | { type: 'setDuration'; ticks: number }
  | { type: 'insertBeat' }
  | { type: 'deleteBeat' }
  | { type: 'insertBar' }
  | { type: 'deleteBar' }
  | { type: 'copyBar' }
  | { type: 'pasteBar' }
  | { type: 'chord'; bar: number; symbol: string }
  | {
      type: 'meta';
      patch: Partial<Pick<Tab, 'title' | 'tuning' | 'capo' | 'tempoBpm' | 'timeSig'>>;
    }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'load'; tab: Tab };

/** A second digit within this time makes a two-digit fret (1 then 2 → 12). */
export const TWO_DIGIT_MS = 800;
const HISTORY = 100;
export const MIN_TICKS = TPQ / 8; // a 32nd note
export const MAX_TICKS = TPQ * 4; // a whole note

export function createEditor(tab: Tab): EditorState {
  return {
    tab,
    cursor: { bar: 0, beat: 0, string: 1 },
    past: [],
    future: [],
    clipboard: null,
    pending: null,
  };
}

const bars = (tab: Tab): Bar[] => tab.tracks[0]?.bars ?? [];

function clampCursor(tab: Tab, c: Cursor): Cursor {
  const list = bars(tab);
  const bar = Math.max(0, Math.min(list.length - 1, c.bar));
  const beats = list[bar]?.beats.length ?? 1;
  return {
    bar,
    beat: Math.max(0, Math.min(beats - 1, c.beat)),
    string: Math.max(1, Math.min(tab.tuning.length, c.string)),
  };
}

/** A copy of the tab with the first track's bars replaced. */
function withBars(tab: Tab, next: Bar[]): Tab {
  return { ...tab, tracks: [{ ...tab.tracks[0], bars: next }, ...tab.tracks.slice(1)] };
}

function mapBeat(tab: Tab, c: Cursor, f: (beat: Beat) => Beat): Tab {
  return withBars(
    tab,
    bars(tab).map((bar, b) =>
      b !== c.bar
        ? bar
        : { ...bar, beats: bar.beats.map((beat, i) => (i === c.beat ? f(beat) : beat)) },
    ),
  );
}

function setNote(tab: Tab, c: Cursor, fret: number | null): Tab {
  return mapBeat(tab, c, (beat) => {
    const others = beat.notes.filter((n) => n.string !== c.string);
    const kept = beat.notes.find((n) => n.string === c.string);
    const notes =
      fret === null
        ? others
        : [...others, { ...(kept ?? {}), string: c.string, fret }].sort(
            (a, b) => a.string - b.string,
          );
    // Canonical form: `rest: true` only on empty beats, never `rest: false`.
    const { rest: _rest, ...kept2 } = beat;
    void _rest;
    return notes.length === 0 ? { ...kept2, notes, rest: true } : { ...kept2, notes };
  });
}

/** Apply an edit that changes the tab: record history, clear redo. */
function commit(s: EditorState, tab: Tab, cursor = s.cursor): EditorState {
  return {
    ...s,
    tab,
    cursor: clampCursor(tab, cursor),
    past: [...s.past, s.tab].slice(-HISTORY),
    future: [],
    pending: null,
  };
}

function step(s: EditorState, beats: number): Cursor {
  const list = bars(s.tab);
  let { bar, beat } = s.cursor;
  beat += beats;
  while (beat < 0 && bar > 0) {
    bar--;
    beat += list[bar]!.beats.length;
  }
  while (bar < list.length - 1 && beat >= list[bar]!.beats.length) {
    beat -= list[bar]!.beats.length;
    bar++;
  }
  return { ...s.cursor, bar, beat };
}

export function edit(s: EditorState, a: EditAction): EditorState {
  const c = s.cursor;
  const list = bars(s.tab);
  switch (a.type) {
    case 'move': {
      const moved = a.beats ? step(s, a.beats) : c;
      return {
        ...s,
        pending: null,
        cursor: clampCursor(s.tab, { ...moved, string: moved.string + (a.strings ?? 0) }),
      };
    }
    case 'moveBar':
      return {
        ...s,
        pending: null,
        cursor: clampCursor(s.tab, { ...c, bar: c.bar + a.bars, beat: 0 }),
      };
    case 'home':
      return { ...s, pending: null, cursor: { ...c, beat: 0 } };
    case 'end':
      return { ...s, pending: null, cursor: clampCursor(s.tab, { ...c, beat: Infinity }) };
    case 'goto':
      return { ...s, pending: null, cursor: clampCursor(s.tab, a.cursor) };
    case 'digit': {
      // "1" then "2" quickly → fret 12 (replacing the 1 just written); otherwise a new fret.
      const p = s.pending;
      if (p && a.tMs - p.tMs <= TWO_DIGIT_MS && p.digit * 10 + a.digit <= MAX_FRET) {
        const prevTab = s.past[s.past.length - 1] ?? s.tab;
        const tab = setNote(s.tab, c, p.digit * 10 + a.digit);
        return { ...s, tab, past: s.past.length ? s.past : [prevTab], future: [], pending: null };
      }
      const next = commit(s, setNote(s.tab, c, a.digit));
      return { ...next, pending: a.digit <= 2 ? { digit: a.digit, tMs: a.tMs } : null };
    }
    case 'fret':
      return a.fret >= 0 && a.fret <= MAX_FRET ? commit(s, setNote(s.tab, c, a.fret)) : s;
    case 'clear':
      return commit(s, setNote(s.tab, c, null));
    case 'tech': {
      const note = list[c.bar]?.beats[c.beat]?.notes.find((n) => n.string === c.string);
      if (!note) return s;
      return commit(
        s,
        mapBeat(s.tab, c, (beat) => ({
          ...beat,
          notes: beat.notes.map((n) => {
            if (n.string !== c.string) return n;
            const rest = { string: n.string, fret: n.fret };
            if (n.tech === a.tech) return rest; // toggles off
            return a.tech === 'b' || a.tech === 'r'
              ? { ...rest, tech: a.tech, bendSemis: 2 }
              : { ...rest, tech: a.tech };
          }),
        })),
      );
    }
    case 'duration': {
      const beat = list[c.bar]?.beats[c.beat];
      if (!beat) return s;
      const ticks = a.op === 'double' ? beat.durTicks * 2 : beat.durTicks / 2;
      return edit(s, { type: 'setDuration', ticks });
    }
    case 'setDuration': {
      if (!(a.ticks >= MIN_TICKS && a.ticks <= MAX_TICKS)) return s;
      return commit(
        s,
        mapBeat(s.tab, c, (beat) => ({ ...beat, durTicks: Math.round(a.ticks) })),
      );
    }
    case 'insertBeat': {
      const bar = list[c.bar];
      if (!bar) return s;
      const durTicks = bar.beats[c.beat]?.durTicks ?? TPQ;
      const beats = [...bar.beats];
      beats.splice(c.beat + 1, 0, { durTicks, notes: [], rest: true });
      return commit(
        s,
        withBars(
          s.tab,
          list.map((x, i) => (i === c.bar ? { ...x, beats } : x)),
        ),
        { ...c, beat: c.beat + 1 },
      );
    }
    case 'deleteBeat': {
      const bar = list[c.bar];
      if (!bar || bar.beats.length <= 1) return s;
      const beats = bar.beats.filter((_, i) => i !== c.beat);
      return commit(
        s,
        withBars(
          s.tab,
          list.map((x, i) => (i === c.bar ? { ...x, beats } : x)),
        ),
        c,
      );
    }
    case 'insertBar': {
      const empty: Bar = {
        beats: Array.from({ length: s.tab.timeSig[0] }, () => ({
          durTicks: (TPQ * 4) / s.tab.timeSig[1],
          notes: [],
          rest: true,
        })),
      };
      const next = [...list];
      next.splice(c.bar + 1, 0, empty);
      return commit(s, withBars(s.tab, next), { ...c, bar: c.bar + 1, beat: 0 });
    }
    case 'deleteBar': {
      if (list.length <= 1) return s;
      return commit(
        s,
        withBars(
          s.tab,
          list.filter((_, i) => i !== c.bar),
        ),
        { ...c, beat: 0 },
      );
    }
    case 'copyBar':
      return list[c.bar] ? { ...s, clipboard: structuredClone(list[c.bar]!) } : s;
    case 'pasteBar': {
      if (!s.clipboard) return s;
      const next = [...list];
      next.splice(c.bar + 1, 0, structuredClone(s.clipboard));
      return commit(s, withBars(s.tab, next), { ...c, bar: c.bar + 1, beat: 0 });
    }
    case 'chord': {
      const symbol = a.symbol.trim().slice(0, 16);
      return commit(
        s,
        withBars(
          s.tab,
          list.map((bar, i) => {
            if (i !== a.bar) return bar;
            const rest: Bar = { beats: bar.beats };
            return symbol ? { ...rest, chordSymbol: symbol } : rest;
          }),
        ),
      );
    }
    case 'meta':
      return commit(s, { ...s.tab, ...a.patch });
    case 'undo': {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return {
        ...s,
        tab: prev,
        past: s.past.slice(0, -1),
        future: [s.tab, ...s.future],
        cursor: clampCursor(prev, c),
        pending: null,
      };
    }
    case 'redo': {
      const next = s.future[0];
      if (!next) return s;
      return {
        ...s,
        tab: next,
        past: [...s.past, s.tab],
        future: s.future.slice(1),
        cursor: clampCursor(next, c),
        pending: null,
      };
    }
    case 'load':
      return createEditor(a.tab);
  }
}

/** Note (if any) under the cursor. */
export function noteAt(tab: Tab, c: Cursor) {
  return bars(tab)[c.bar]?.beats[c.beat]?.notes.find((n) => n.string === c.string);
}

/** How full each bar is relative to the time signature: <1 short, >1 too long. */
export function barFill(tab: Tab): number[] {
  const want = (tab.timeSig[0] * TPQ * 4) / tab.timeSig[1];
  return bars(tab).map((bar) => bar.beats.reduce((sum, b) => sum + b.durTicks, 0) / want);
}
