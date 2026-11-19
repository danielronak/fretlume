/**
 * Tab play-along (phase 5 task 5.7, docs/specs/05-ux.md §4): for a playback position, what the
 * neck shows — the notes sounding now (solid), the notes coming up as approaching rings (`lead` 1 →
 * 0 as they get closer), and the next bar's chord as a ghost one beat early. Pure.
 */
import { chordVoicings } from '../theory/chords/index';
import { parseChordSymbol } from '../theory/chords/parse';
import { makeMarks, makeShape } from '../theory/shape';
import type { Shape } from '../theory/types';
import type { Tab, TabNote, TimedBeat } from './model';

export interface Approach {
  string: number;
  /** Fret on the neck (capo included). */
  fret: number;
  /** 1 = a full look-ahead away, 0 = sounding now. */
  lead: number;
}

export interface PlayAlongFrame {
  /** Index of the sounding beat in the timeline (−1 before the start). */
  index: number;
  /** Notes sounding now (muted 'x' notes are left out). */
  current: TabNote[];
  /** 0 → 1 through the sounding beat (for the sustain tail). */
  progress: number;
  upcoming: Approach[];
  /** The chord of the bar being played, and the next one once it is within one beat. */
  chord: string | null;
  nextChord: string | null;
}

const audible = (n: TabNote) => n.tech !== 'x';

export function playAlongFrame(
  beats: readonly TimedBeat[],
  tick: number,
  options: { lookaheadTicks: number; beatTicks: number; capo?: number },
): PlayAlongFrame {
  const capo = options.capo ?? 0;
  let index = -1;
  for (let i = 0; i < beats.length && beats[i]!.tick <= tick; i++) index = i;
  const now = beats[index];
  const inBeat = now !== undefined && tick < now.tick + now.durTicks;
  const current = inBeat ? now.notes.filter(audible) : [];
  const progress = inBeat ? (tick - now.tick) / now.durTicks : 0;

  const upcoming: Approach[] = [];
  let nextChord: string | null = null;
  for (let j = index + 1; j < beats.length; j++) {
    const b = beats[j]!;
    const ahead = b.tick - tick;
    if (ahead > Math.max(options.lookaheadTicks, options.beatTicks)) break;
    if (nextChord === null && b.chordSymbol && ahead <= options.beatTicks)
      nextChord = b.chordSymbol;
    if (ahead > options.lookaheadTicks) continue;
    const lead = Math.max(0, Math.min(1, ahead / options.lookaheadTicks));
    for (const n of b.notes.filter(audible))
      upcoming.push({ string: n.string, fret: n.fret + capo, lead });
  }

  let chord: string | null = null;
  for (let k = index; k >= 0; k--) {
    const symbol = beats[k]!.chordSymbol;
    if (symbol) {
      chord = symbol;
      break;
    }
  }
  return { index, current, progress, upcoming, chord, nextChord };
}

/** First library voicing of a chord symbol (frets per string, −1 muted), or null. */
export function chordGhostFrets(symbol: string, tuning: readonly number[]): number[] | null {
  const parsed = parseChordSymbol(symbol);
  if (!parsed || tuning.length !== 6) return null;
  const voicing = chordVoicings(parsed.root, parsed.qualityId, {
    tuning: { id: 'tab', name: 'tab', strings: [...tuning] },
    limit: 1,
  })[0];
  return voicing ? voicing.frets : null;
}

/**
 * The shape drawn for a frame: sounding notes in group "now"; the next chord's notes in group
 * "next" (drawn as ghosts). Frets are moved up by the capo so they land on the real neck.
 */
export function playAlongShape(tab: Tab, frame: PlayAlongFrame): Shape {
  const tuning = { id: 'tab', name: 'tab', strings: [...tab.tuning] };
  const context = { root: { letter: 0, accidental: 0 }, degrees: ['1'] }; // names only
  const inputs = frame.current.map((n) => ({
    string: n.string,
    fret: n.fret + tab.capo,
    groups: ['now'],
  }));
  const ghost = frame.nextChord ? chordGhostFrets(frame.nextChord, tab.tuning) : null;
  if (ghost)
    ghost.forEach((fret, i) => {
      if (fret < 0) return;
      const string = i + 1;
      const pos = { string, fret: fret + tab.capo };
      if (!inputs.some((x) => x.string === pos.string && x.fret === pos.fret))
        inputs.push({ ...pos, groups: ['next'] });
    });
  return makeShape({
    id: `tab:${tab.id}:${frame.index}`,
    kind: 'notes',
    title: tab.title,
    marks: makeMarks(tuning, context, inputs),
    groups: [
      { id: 'now', label: 'now' },
      { id: 'next', label: 'next' },
    ],
  });
}
