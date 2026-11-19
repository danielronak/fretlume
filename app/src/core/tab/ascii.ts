/**
 * ASCII tab (phase 5 task 5.6): export with a rhythm row so a Fretlume tab re-imports exactly; import
 * ordinary six-line tabs too (notes lined up by column, "5h7" split into two notes, beats spread
 * evenly over the bar when there is no rhythm row). Pure.
 */
import {
  MAX_FRET,
  STANDARD_TAB_TUNING,
  TPQ,
  type Bar,
  type Beat,
  type Tab,
  type TabNote,
  type Technique,
} from './model';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiName = (m: number) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
function parseMidiName(s: string): number | null {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(s);
  if (!m) return null;
  const base = NAMES.indexOf(m[1]!.toUpperCase());
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return base + acc + (Number(m[3]) + 1) * 12;
}

const DURATIONS: [string, number][] = [
  ['w', TPQ * 4],
  ['h', TPQ * 2],
  ['q', TPQ],
  ['e', TPQ / 2],
  ['s', TPQ / 4],
  ['t', TPQ / 8],
];
function durationToken(ticks: number): string {
  for (const [c, d] of DURATIONS) {
    if (ticks === d) return c;
    if (ticks === d * 1.5) return `${c}.`;
  }
  return `{${ticks}}`;
}
function parseDuration(token: string): number | null {
  const braces = /^\{(\d+)\}$/.exec(token);
  if (braces) return Number(braces[1]);
  const m = /^([whqest])(\.?)$/.exec(token);
  if (!m) return null;
  const d = DURATIONS.find(([c]) => c === m[1])![1];
  return m[2] ? d * 1.5 : d;
}

/** The text one note takes in its column. */
export function noteToken(n: TabNote): string {
  const semis = n.bendSemis ?? 1;
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  switch (n.tech) {
    case 'x':
      return 'x';
    case 'h':
    case 'p':
    case '/':
    case '\\':
      return `${n.tech}${n.fret}`;
    case 'b':
      return `${n.fret}b${fmt(n.fret + semis)}`;
    case 'r':
      return `${fmt(n.fret + semis)}r${n.fret}`;
    case '~':
      return `${n.fret}~`;
    default:
      return String(n.fret);
  }
}

/** Parse one token ("7", "h7", "7b9", "9r7", "7~", "x"); pm comes from the palm-mute row. */
export function parseToken(text: string): TabNote | null {
  let m: RegExpExecArray | null;
  if (/^[xX]$/.test(text)) return { string: 0, fret: 0, tech: 'x' };
  if ((m = /^([hp/\\])(\d{1,2})$/.exec(text)))
    return { string: 0, fret: Number(m[2]), tech: m[1] as Technique };
  if ((m = /^(\d{1,2})b(\d{1,2}(?:\.5)?)$/.exec(text)))
    return { string: 0, fret: Number(m[1]), tech: 'b', bendSemis: Number(m[2]) - Number(m[1]) };
  if ((m = /^(\d{1,2}(?:\.5)?)r(\d{1,2})$/.exec(text)))
    return { string: 0, fret: Number(m[2]), tech: 'r', bendSemis: Number(m[1]) - Number(m[2]) };
  if ((m = /^(\d{1,2})~$/.exec(text))) return { string: 0, fret: Number(m[1]), tech: '~' };
  if ((m = /^(\d{1,2})$/.exec(text))) return { string: 0, fret: Number(m[1]) };
  return null;
}

const STRING_LABEL = (tuning: number[], s: number) => {
  const name = NAMES[((tuning[s - 1]! % 12) + 12) % 12]!;
  return s === 1 ? name.toLowerCase() : name;
};

/** Export: header, then systems of up to `barsPerLine` bars (chord row, strings, PM row, rhythm row). */
export function toAscii(tab: Tab, barsPerLine = 4): string {
  const lines = [
    `Title: ${tab.title}`,
    `Tempo: ${tab.tempoBpm}`,
    `Time: ${tab.timeSig[0]}/${tab.timeSig[1]}`,
    `Tuning: ${[...tab.tuning].reverse().map(midiName).join(' ')}`,
    `Capo: ${tab.capo}`,
    '',
  ];
  const strings = tab.tuning.length;
  const bars = tab.tracks[0]?.bars ?? [];
  const labelW =
    Math.max(
      2,
      ...Array.from({ length: strings }, (_, i) => STRING_LABEL(tab.tuning, i + 1).length),
    ) + 1;
  for (let start = 0; start < bars.length; start += barsPerLine) {
    const chunk = bars.slice(start, start + barsPerLine);
    const rows = Array.from(
      { length: strings },
      (_, i) => STRING_LABEL(tab.tuning, i + 1).padEnd(labelW - 1) + '|',
    );
    let chords = ' '.repeat(labelW);
    let pm = 'PM'.padEnd(labelW - 1) + '|';
    let rhythm = 'R'.padEnd(labelW - 1) + '|';
    for (const bar of chunk) {
      if (bar.chordSymbol) chords = chords.padEnd(rows[0]!.length + 1) + bar.chordSymbol;
      for (let i = 0; i < strings; i++) rows[i] += '-';
      pm += ' ';
      rhythm += ' ';
      for (const beat of bar.beats) {
        const tokens = Array.from({ length: strings }, (_, i) => {
          const n = beat.notes.find((x) => x.string === i + 1);
          return n ? noteToken(n) : '';
        });
        const dur = durationToken(beat.durTicks);
        const w = Math.max(1, dur.length, ...tokens.map((t) => t.length));
        for (let i = 0; i < strings; i++) rows[i] += tokens[i]!.padEnd(w, '-') + '-';
        pm += (beat.notes.some((n) => n.tech === 'pm') ? 'm' : ' ').padEnd(w + 1);
        rhythm += dur.padEnd(w + 1);
      }
      for (let i = 0; i < strings; i++) rows[i] += '|';
      pm += '|';
      rhythm += '|';
    }
    if (chords.trim()) lines.push(chords.trimEnd());
    lines.push(...rows);
    if (pm.includes('m')) lines.push(pm.trimEnd());
    lines.push(rhythm.trimEnd(), '');
  }
  return lines.join('\n');
}

export type TabParseCode = 'noTab' | 'noChords' | 'unreadable' | 'noTracks' | 'tooBig';

/** A file or text that is not a tab; `code` picks the friendly message the UI shows. */
export class TabParseError extends Error {
  constructor(
    readonly code: TabParseCode,
    message: string,
  ) {
    super(message);
    this.name = 'TabParseError';
  }
}

interface Token {
  col: number;
  text: string;
}

/** Runs of non-dash characters in a bar segment, with "5h7" style runs split into notes. */
function tokens(segment: string, offset: number): Token[] {
  const out: Token[] = [];
  const re = /[^-\s|]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment))) {
    // Split before each technique letter that starts a new note: 5h7 → 5, h7; 5/7\5 → 5, /7, \5.
    const parts = m[0].split(/(?=[hp/\\](?=\d))/);
    let col = offset + m.index;
    for (const p of parts) {
      if (p) out.push({ col, text: p });
      col += p.length;
    }
  }
  return out;
}

const STRING_LINE = /^\s*([A-Ga-g][#b]?)\s*\|(.*)$/;

/** Import ASCII tab text; throws TabParseError with a friendly message when there is no tab. */
export function fromAscii(text: string, id: string): Tab {
  const lines = text.replace(/\r/g, '').split('\n');
  const header = (key: string) =>
    lines
      .map((l) => new RegExp(`^${key}:\\s*(.+)$`, 'i').exec(l.trim())?.[1])
      .find((v) => v !== undefined);
  const title = header('Title') ?? 'Imported tab';
  const tempo = Number(header('Tempo'));
  const time = /^(\d+)\/(\d+)$/.exec(header('Time') ?? '');
  const tuningText = header('Tuning');
  const capo = Number(header('Capo') ?? 0);

  // Systems: runs of consecutive string lines; chord line just above, PM and R rows just below.
  const bars: Bar[] = [];
  let strings = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!STRING_LINE.test(lines[i]!)) continue;
    let j = i;
    while (j < lines.length && STRING_LINE.test(lines[j]!)) j++;
    const block = lines.slice(i, j);
    if (block.length < 4) {
      i = j;
      continue;
    }
    strings = Math.max(strings, block.length);
    const chordLine = i > 0 && !lines[i - 1]!.includes('|') ? lines[i - 1]! : '';
    const pmLine = lines[j] !== undefined && /^PM\s*\|/.test(lines[j]!) ? lines[j]! : '';
    const rLineIndex = pmLine ? j + 1 : j;
    const rLine =
      lines[rLineIndex] !== undefined && /^R\s*\|/.test(lines[rLineIndex]!)
        ? lines[rLineIndex]!
        : '';
    bars.push(...parseSystem(block, chordLine, pmLine, rLine));
    i = rLine ? rLineIndex : pmLine ? j : j - 1;
  }
  if (bars.length === 0)
    throw new TabParseError('noTab', 'No tab found: expected lines like “e|-0-3-|”.');

  let tuning = [...STANDARD_TAB_TUNING];
  if (tuningText) {
    const midi = tuningText.split(/\s+/).map(parseMidiName);
    if (midi.every((m): m is number => m !== null) && midi.length === strings)
      tuning = midi.reverse();
  } else if (strings !== 6) {
    tuning = STANDARD_TAB_TUNING.slice(0, strings);
  }
  return {
    id,
    title: title.slice(0, 120),
    tuning,
    capo: Number.isFinite(capo) ? Math.max(0, Math.min(12, capo)) : 0,
    tempoBpm: tempo >= 20 && tempo <= 400 ? tempo : 90,
    timeSig: time ? [Number(time[1]), Number(time[2])] : [4, 4],
    tracks: [{ bars }],
  };
}

function parseSystem(block: string[], chordLine: string, pmLine: string, rLine: string): Bar[] {
  // Bar lines are where the first string line has '|'.
  const first = block[0]!;
  const start = first.indexOf('|');
  const pipes: number[] = [];
  for (let c = start; c < first.length; c++) if (first[c] === '|') pipes.push(c);
  const bars: Bar[] = [];
  for (let k = 0; k + 1 < pipes.length; k++) {
    const [a, b] = [pipes[k]! + 1, pipes[k + 1]!];
    const perString = block.map((line) => tokens(line.slice(a, b), a));
    // Notes that start within one column of each other are one beat, unless a string already has a
    // note in that beat ("5h7" on one string is two beats).
    const placed = perString
      .flatMap((list, s) => list.map((t) => ({ ...t, s })))
      .sort((x, y) => x.col - y.col || x.s - y.s);
    const groupList: { col: number; byString: Map<number, string> }[] = [];
    for (const t of placed) {
      const g = groupList[groupList.length - 1];
      if (g && t.col - g.col <= 1 && !g.byString.has(t.s)) g.byString.set(t.s, t.text);
      else groupList.push({ col: t.col, byString: new Map([[t.s, t.text]]) });
    }
    const groups = groupList.map((g) => g.col);
    const rhythm = rLine ? tokens(rLine.slice(a, b), a) : [];
    const beats: Beat[] = groupList.map(({ col, byString }) => {
      const notes: TabNote[] = [];
      for (const [s, text] of [...byString].sort((x, y) => x[0] - y[0])) {
        const note = parseToken(text);
        if (note && note.fret <= MAX_FRET) notes.push({ ...note, string: s + 1 });
      }
      const palm = pmLine.slice(col, col + 2).includes('m');
      const r = rhythm.find((x) => x.col >= col && x.col <= col + 1);
      const beat: Beat = {
        durTicks: (r && parseDuration(r.text)) || 0,
        notes: palm ? notes.map((n) => (n.tech ? n : { ...n, tech: 'pm' as const })) : notes,
      };
      if (notes.length === 0) beat.rest = true;
      return beat;
    });
    // Rhythm row tokens without notes are rests.
    for (const r of rhythm) {
      if (!groups.some((g) => r.col >= g && r.col <= g + 1)) {
        const at = groups.findIndex((g) => g > r.col);
        const rest: Beat = { durTicks: parseDuration(r.text) ?? TPQ, notes: [], rest: true };
        if (at < 0) beats.push(rest);
        else beats.splice(at, 0, rest);
      }
    }
    if (beats.length === 0) beats.push({ durTicks: TPQ * 4, notes: [], rest: true });
    // Without a rhythm row: spread the beats evenly over a 4/4 bar on a sixteenth grid.
    if (beats.some((x) => !x.durTicks)) {
      const each = Math.max(TPQ / 4, Math.floor((TPQ * 4) / beats.length / (TPQ / 4)) * (TPQ / 4));
      for (const x of beats) if (!x.durTicks) x.durTicks = each;
    }
    const chord = chordLine
      .slice(a - 1, b)
      .trim()
      .split(/\s+/)[0];
    bars.push(chord ? { beats, chordSymbol: chord } : { beats });
  }
  return bars;
}
