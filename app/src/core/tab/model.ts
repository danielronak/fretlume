/**
 * Tabs (docs/specs/03-theory-content.md §8; phase 5 task 5.4). A tab is bars of beats; a beat holds
 * notes (string, fret, technique) and lasts some ticks. This module times them and plans how they
 * sound; the audio player only carries the plan out. Pure.
 */

/** Ticks per quarter note. */
export const TPQ = 480;

/** h hammer-on · p pull-off · / slide up · \ slide down · b bend · r release · ~ vibrato · x muted · pm palm mute */
export type Technique = 'h' | 'p' | '/' | '\\' | 'b' | 'r' | '~' | 'x' | 'pm';
export const TECHNIQUES: readonly Technique[] = ['h', 'p', '/', '\\', 'b', 'r', '~', 'x', 'pm'];

export interface TabNote {
  /** 1 = high e. */
  string: number;
  fret: number;
  tech?: Technique;
  /** Bend amount in semitones (b and r); default 1 (a whole step = 2). */
  bendSemis?: number;
}

export interface Beat {
  durTicks: number;
  notes: TabNote[];
  rest?: boolean;
}

export interface Bar {
  beats: Beat[];
  chordSymbol?: string;
}

export interface Tab {
  id: string;
  title: string;
  /** Open-string MIDI notes, string 1 (high e) first. */
  tuning: number[];
  capo: number;
  tempoBpm: number;
  /** [beats per bar, beat unit] — e.g. [4, 4], [6, 8]. */
  timeSig: [number, number];
  tracks: { bars: Bar[] }[];
  updatedAt?: number;
}

export const STANDARD_TAB_TUNING = [64, 59, 55, 50, 45, 40];
export const MAX_FRET = 24;

/** Ticks one bar should hold. */
export function barTicks(tab: Pick<Tab, 'timeSig'>): number {
  const [n, unit] = tab.timeSig;
  return Math.round((n * TPQ * 4) / unit);
}

export function newTab(id: string, title: string, bars = 4): Tab {
  const quarter = (): Beat => ({ durTicks: TPQ, notes: [], rest: true });
  return {
    id,
    title,
    tuning: [...STANDARD_TAB_TUNING],
    capo: 0,
    tempoBpm: 90,
    timeSig: [4, 4],
    tracks: [
      {
        bars: Array.from({ length: bars }, () => ({
          beats: [quarter(), quarter(), quarter(), quarter()],
        })),
      },
    ],
  };
}

export function noteMidi(
  tab: Pick<Tab, 'tuning' | 'capo'>,
  note: Pick<TabNote, 'string' | 'fret'>,
): number {
  const open = tab.tuning[note.string - 1];
  if (open === undefined) throw new Error(`string ${note.string} is not in this tuning`);
  return open + tab.capo + note.fret;
}

export interface TimedBeat {
  bar: number;
  beat: number;
  tick: number;
  durTicks: number;
  notes: TabNote[];
  rest: boolean;
  chordSymbol?: string;
}

/** Every beat of the first track with its start tick (bars in order, beats in order). */
export function timeline(tab: Tab): TimedBeat[] {
  const out: TimedBeat[] = [];
  let tick = 0;
  (tab.tracks[0]?.bars ?? []).forEach((bar, b) => {
    bar.beats.forEach((beat, i) => {
      out.push({
        bar: b,
        beat: i,
        tick,
        durTicks: beat.durTicks,
        notes: beat.notes,
        rest: beat.rest === true || beat.notes.length === 0,
        ...(i === 0 && bar.chordSymbol ? { chordSymbol: bar.chordSymbol } : {}),
      });
      tick += beat.durTicks;
    });
  });
  return out;
}

/** Index of the beat sounding at `tick` (the last beat starting at or before it); −1 before the first. */
export function beatIndexAt(beats: readonly Pick<TimedBeat, 'tick'>[], tick: number): number {
  if (beats.length === 0 || tick < beats[0]!.tick) return -1;
  let lo = 0;
  let hi = beats.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (beats[mid]!.tick <= tick) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Start tick of each bar, plus the total length as the last element. */
export function barStarts(tab: Tab): number[] {
  const starts: number[] = [];
  let tick = 0;
  for (const bar of tab.tracks[0]?.bars ?? []) {
    starts.push(tick);
    tick += bar.beats.reduce((s, b) => s + b.durTicks, 0);
  }
  starts.push(tick);
  return starts;
}

/** Seconds per tick at the tab's tempo × `tempoPct` / 100 (the tempo counts quarter notes). */
export function secondsPerTick(tab: Pick<Tab, 'tempoBpm'>, tempoPct = 100): number {
  return 60 / (tab.tempoBpm * (tempoPct / 100)) / TPQ;
}

/** One voice the synth plays: a plucked note, a ghost (no pluck), or a short noise. */
export interface Voice {
  kind: 'pluck' | 'legato' | 'noise';
  midi: number;
  string: number;
  fret: number;
  /** Seconds from the start of playback. */
  start: number;
  /** Seconds the note may ring (until the next note on its string, or the end of its beat + tail). */
  end: number;
  gain: number;
  /** Pitch changes in semitones relative to `midi`: [seconds from start, semitones]. */
  pitch?: [number, number][];
  /** Palm mute: let it die quickly. */
  damped?: boolean;
  /** The voice a slide continues (index into the plan): it glides instead of a new pluck. */
  glideFrom?: number;
}

/**
 * How the tab sounds, from tick `fromTick` to `toTick` (a loop window), at a tempo percentage.
 * Techniques: hammer-on/pull-off do not re-pluck (softer, no attack); a slide glides the previous
 * note on that string to the new fret; bend and release follow a pitch curve; vibrato wobbles
 * ±0.25 semitone; a muted note is a noise burst; palm mute shortens the decay.
 */
export function planVoices(
  tab: Tab,
  options: { tempoPct?: number; fromTick?: number; toTick?: number } = {},
): Voice[] {
  const spt = secondsPerTick(tab, options.tempoPct ?? 100);
  const from = options.fromTick ?? 0;
  const to = options.toTick ?? Infinity;
  const beats = timeline(tab).filter((b) => b.tick >= from && b.tick < to);
  const voices: Voice[] = [];
  /** Last voice index per string (for legato, slides and cutting ringing notes). */
  const lastOnString = new Map<number, number>();
  for (const beat of beats) {
    const start = (beat.tick - from) * spt;
    const dur = beat.durTicks * spt;
    for (const note of beat.notes) {
      const midi = noteMidi(tab, note);
      const prevIndex = lastOnString.get(note.string);
      const prev = prevIndex === undefined ? undefined : voices[prevIndex];
      // A new note on a string stops the one ringing there.
      if (prev && prev.end > start) prev.end = start;
      const base: Voice = {
        kind: 'pluck',
        midi,
        string: note.string,
        fret: note.fret,
        start,
        end: start + Math.max(dur, 0.12) + 0.6,
        gain: 0.7,
      };
      switch (note.tech) {
        case 'x':
          voices.push({ ...base, kind: 'noise', end: start + 0.04, gain: 0.5 });
          break;
        case 'h':
        case 'p':
          voices.push({ ...base, kind: 'legato', gain: 0.5 });
          break;
        case '/':
        case '\\':
          if (prev && prev.kind !== 'noise') {
            // The previous note glides to this fret over the first part of this beat.
            const glide = Math.min(0.12, dur * 0.5);
            prev.end = start + Math.max(dur, 0.12) + 0.6;
            const semis = midi - prev.midi;
            const at = start - prev.start;
            prev.pitch = [...(prev.pitch ?? []), [at, lastSemis(prev)], [at + glide, semis]];
            voices.push({ ...base, kind: 'legato', gain: 0, glideFrom: prevIndex! });
          } else voices.push(base);
          break;
        case 'b': {
          const semis = note.bendSemis ?? 1;
          voices.push({
            ...base,
            pitch: [
              [0, 0],
              [Math.min(dur * 0.5, 0.25), semis],
            ],
          });
          break;
        }
        case 'r': {
          const semis = note.bendSemis ?? 1;
          voices.push({
            ...base,
            kind: 'legato',
            gain: 0.5,
            pitch: [
              [0, semis],
              [Math.min(dur * 0.5, 0.25), 0],
            ],
          });
          break;
        }
        case '~': {
          const pts: [number, number][] = [];
          for (let t = 0; t <= dur; t += 0.08) pts.push([t, ((pts.length % 2) * 2 - 1) * 0.25]);
          voices.push({ ...base, pitch: pts });
          break;
        }
        case 'pm':
          voices.push({
            ...base,
            damped: true,
            end: start + Math.min(dur, 0.15) + 0.05,
            gain: 0.6,
          });
          break;
        default:
          voices.push(base);
      }
      lastOnString.set(
        note.string,
        note.tech === '/' || note.tech === '\\'
          ? (prevIndex ?? voices.length - 1)
          : voices.length - 1,
      );
    }
  }
  return voices;
}

function lastSemis(v: Voice): number {
  return v.pitch?.length ? v.pitch[v.pitch.length - 1]![1] : 0;
}

/** Problems that make a tab unplayable, in words (empty = fine). */
export function validateTab(tab: Tab): string[] {
  const problems: string[] = [];
  const strings = tab.tuning.length;
  if (strings < 4 || strings > 8) problems.push(`a tab needs 4–8 strings (has ${strings})`);
  if (!(tab.tempoBpm >= 20 && tab.tempoBpm <= 400)) problems.push('tempo must be 20–400 BPM');
  if (!(tab.capo >= 0 && tab.capo <= 12)) problems.push('capo must be 0–12');
  const [n, unit] = tab.timeSig;
  if (!(n >= 1 && n <= 16) || ![1, 2, 4, 8, 16].includes(unit))
    problems.push('time signature not supported');
  timeline(tab).forEach((b) => {
    if (!(b.durTicks > 0)) problems.push(`bar ${b.bar + 1}, beat ${b.beat + 1}: no length`);
    for (const note of b.notes) {
      if (!(note.string >= 1 && note.string <= strings))
        problems.push(`bar ${b.bar + 1}, beat ${b.beat + 1}: string ${note.string} does not exist`);
      if (!(note.fret >= 0 && note.fret <= MAX_FRET))
        problems.push(`bar ${b.bar + 1}, beat ${b.beat + 1}: fret ${note.fret} is out of range`);
    }
  });
  return problems;
}
