/**
 * Audio fixture plan (phase 6 task 6.1): *what* is played, decided with the theory engine — notes on
 * every string, chord voicings strummed at several speeds, deliberate faults, string-by-string checks
 * and tab phrases for timing. tools/audio/render.py turns the plan into audio (our Karplus–Strong twin
 * and FluidSynth's General MIDI guitars) and writes the manifest with ground truth.
 */
import { chordVoicings } from '@core/theory/chords/index';
import { rng } from '@audio/dsp/synth';

export const STANDARD = [64, 59, 55, 50, 45, 40]; // string 1 … 6

export type Source = 'ks' | 'steel' | 'nylon' | 'electric';

export interface PlanNote {
  /** Seconds from the item's start. */
  t: number;
  string: number;
  fret: number;
  midi: number;
  velocity: number;
  /** Seconds the note is held (released after). */
  dur: number;
}

export type Fault =
  | { kind: 'muted'; string: number }
  | { kind: 'wrong-fret'; string: number; by: number }
  | { kind: 'extra-open'; string: number };

export interface PlanItem {
  id: string;
  kind: 'note' | 'chord' | 'sbs' | 'phrase';
  /** Item length in seconds (start times follow one another in the group). */
  dur: number;
  /** What the player was asked to play (string, fret, midi), low string first. */
  expected: { string: number; fret: number; midi: number }[];
  /** Strings that should stay silent. */
  muted: number[];
  /** What actually sounds (expected with the fault applied). */
  notes: PlanNote[];
  fault?: Fault;
  strum?: { direction: 'down' | 'up'; spreadMs: number };
  /** Whole-guitar detune in cents (a guitar slightly out of tune). */
  detuneCents: number;
  label: string;
}

export interface PlanGroup {
  name: string;
  sources: Source[];
  /** Render an augmented copy too (room, band-limit, noise, level). */
  augment: boolean;
  items: PlanItem[];
}

export interface AudioPlan {
  version: 1;
  sampleRate: number;
  groups: PlanGroup[];
}

const QUALITIES = ['maj', 'min', '7', 'maj7', 'm7', 'sus2', 'sus4', '5'];

/** Up to `limit` voicings: every root × the qualities above × the first two voicings. */
export function planVoicings(limit = 192): { label: string; frets: number[] }[] {
  const out: { label: string; frets: number[] }[] = [];
  for (const q of QUALITIES)
    for (let root = 0; root < 12; root++)
      chordVoicings(root, q, { limit: 2 }).forEach((v, i) =>
        out.push({ label: `${root}-${q}-${i}`, frets: v.frets }),
      );
  return out.slice(0, limit);
}

const midiOf = (string: number, fret: number) => STANDARD[string - 1]! + fret;

export function buildAudioPlan(seed = 6): AudioPlan {
  const random = rng(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)]!;
  const detune = () => Math.round((random() * 2 - 1) * 15);
  const velocity = () => Math.round(70 + random() * 40);

  // 1. Single notes E2…E6: each pitch at its lowest-string position within frets 0–12, and every
  //    pitch above fret 12 of the high e at its fret there.
  const noteItems: PlanItem[] = [];
  for (let midi = 40; midi <= 88; midi++) {
    const positions = [6, 5, 4, 3, 2, 1]
      .map((s) => ({ string: s, fret: midi - STANDARD[s - 1]! }))
      .filter((p) => p.fret >= 0 && p.fret <= 12);
    const where = positions[0] ?? { string: 1, fret: midi - 64 };
    noteItems.push({
      id: `note-${midi}`,
      kind: 'note',
      dur: 1.6,
      expected: [{ ...where, midi }],
      muted: [],
      notes: [{ t: 0.1, ...where, midi, velocity: velocity(), dur: 1.3 }],
      detuneCents: 0,
      label: `midi ${midi} on string ${where.string} fret ${where.fret}`,
    });
  }

  const voicings = planVoicings();
  const chord = (
    id: string,
    frets: number[],
    spreadMs: number,
    direction: 'down' | 'up',
    fault?: Fault,
  ): PlanItem => {
    const expected = frets
      .map((fret, i) => ({ string: i + 1, fret, midi: fret >= 0 ? midiOf(i + 1, fret) : -1 }))
      .filter((n) => n.fret >= 0)
      .reverse(); // low string first
    const muted = frets.map((f, i) => (f < 0 ? i + 1 : 0)).filter(Boolean);
    let sounding = expected.map((n) => ({ ...n }));
    if (fault?.kind === 'muted') sounding = sounding.filter((n) => n.string !== fault.string);
    if (fault?.kind === 'wrong-fret')
      sounding = sounding.map((n) =>
        n.string === fault.string ? { ...n, fret: n.fret + fault.by, midi: n.midi + fault.by } : n,
      );
    if (fault?.kind === 'extra-open')
      sounding = [
        ...sounding,
        { string: fault.string, fret: 0, midi: midiOf(fault.string, 0) },
      ].sort((a, b) => b.string - a.string);
    const order = direction === 'down' ? sounding : [...sounding].reverse();
    const v = velocity();
    return {
      id,
      kind: 'chord',
      dur: 2.2,
      expected,
      muted,
      notes: order.map((n, k) => ({
        t: 0.1 + (k * spreadMs) / 1000,
        string: n.string,
        fret: n.fret,
        midi: n.midi,
        velocity: Math.max(40, Math.min(127, v + Math.round((random() - 0.5) * 16))),
        dur: 1.9 - (k * spreadMs) / 1000,
      })),
      ...(fault ? { fault } : {}),
      strum: { direction, spreadMs },
      detuneCents: detune(),
      label: `${frets.join(',')} ${direction} ${spreadMs}ms${fault ? ` ${fault.kind} s${fault.string}` : ''}`,
    };
  };

  // 2. Clean strums: every voicing at three strum speeds; one in three strummed up.
  const cleanItems: PlanItem[] = [];
  voicings.forEach((v, i) =>
    [15, 35, 70].forEach((spread, j) =>
      cleanItems.push(
        chord(`chord-${v.label}-${spread}`, v.frets, spread, (i + j) % 3 === 2 ? 'up' : 'down'),
      ),
    ),
  );

  // 3. Faults: one muted string, one finger a fret off, one string that should be silent rings open.
  const faultItems: PlanItem[] = [];
  voicings.forEach((v) => {
    const fretted = v.frets.map((f, i) => (f > 0 ? i + 1 : 0)).filter(Boolean);
    const sounding = v.frets.map((f, i) => (f >= 0 ? i + 1 : 0)).filter(Boolean);
    const silent = v.frets.map((f, i) => (f < 0 ? i + 1 : 0)).filter(Boolean);
    faultItems.push(
      chord(`fault-mute-${v.label}`, v.frets, 35, 'down', {
        kind: 'muted',
        string: pick(sounding),
      }),
    );
    if (fretted.length)
      faultItems.push(
        chord(`fault-fret-${v.label}`, v.frets, 35, 'down', {
          kind: 'wrong-fret',
          string: pick(fretted),
          by: random() < 0.5 ? -1 : 1,
        }),
      );
    if (silent.length)
      faultItems.push(
        chord(`fault-open-${v.label}`, v.frets, 35, 'down', {
          kind: 'extra-open',
          string: pick(silent),
        }),
      );
  });

  // 4. String by string: each string of the chord picked alone, low to high, 0.9 s apart; half with
  //    one string muted.
  const sbsItems: PlanItem[] = voicings
    .filter((_, i) => i % 3 === 0)
    .map((v, i) => {
      const base = chord(`sbs-${v.label}`, v.frets, 0, 'down');
      const mutedString = i % 2 === 1 ? pick(base.expected).string : null;
      const notes = base.expected
        .filter((n) => n.string !== mutedString)
        .map((n) => ({
          t: 0.1 + base.expected.indexOf(n) * 0.9,
          ...n,
          velocity: velocity(),
          dur: 0.85,
        }));
      return {
        ...base,
        id: mutedString ? `sbs-mute-${v.label}` : `sbs-${v.label}`,
        kind: 'sbs' as const,
        dur: 0.3 + base.expected.length * 0.9,
        notes,
        ...(mutedString ? { fault: { kind: 'muted' as const, string: mutedString } } : {}),
        label: `${base.label} string by string${mutedString ? ` (string ${mutedString} muted)` : ''}`,
      };
    });

  // 5. Tab phrases for onset timing: an A minor pentatonic run up and down at four tempi, eighths.
  const run = [
    [6, 5],
    [6, 8],
    [5, 5],
    [5, 7],
    [4, 5],
    [4, 7],
    [3, 5],
    [3, 7],
    [2, 5],
    [2, 8],
    [1, 5],
    [1, 8],
  ] as const;
  const phrase = [...run, ...[...run].reverse().slice(1)];
  const phraseItems: PlanItem[] = [60, 90, 120, 160].map((bpm) => {
    const step = 60 / bpm / 2;
    // Human timing: ±8 ms jitter, recorded in the truth.
    const notes = phrase.map(([string, fret], k) => ({
      t: 0.2 + k * step + (random() - 0.5) * 0.016,
      string,
      fret,
      midi: midiOf(string, fret),
      velocity: velocity(),
      dur: step * 0.95,
    }));
    return {
      id: `phrase-${bpm}`,
      kind: 'phrase',
      dur: 0.6 + phrase.length * step,
      expected: notes.map(({ string, fret, midi }) => ({ string, fret, midi })),
      muted: [],
      notes,
      detuneCents: detune(),
      label: `A minor pentatonic eighths at ${bpm} BPM`,
    };
  });

  return {
    version: 1,
    sampleRate: 22050,
    groups: [
      {
        name: 'notes',
        sources: ['ks', 'steel', 'nylon', 'electric'],
        augment: true,
        items: noteItems,
      },
      { name: 'chords', sources: ['ks', 'steel', 'nylon'], augment: true, items: cleanItems },
      { name: 'faults', sources: ['ks', 'steel'], augment: true, items: faultItems },
      { name: 'sbs', sources: ['ks', 'steel'], augment: false, items: sbsItems },
      { name: 'phrases', sources: ['ks', 'steel', 'electric'], augment: true, items: phraseItems },
    ],
  };
}
