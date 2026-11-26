/**
 * The listening engine's real-time core (phase 6 task 6.3), free of browser APIs so it runs in a
 * worker and in Node tests. Audio arrives at 22.05 kHz; onsets are detected continuously; the current
 * expectation (a note or a chord) is judged after each attempt; sounds the app makes itself are masked.
 */
import { chroma, guessChords, type ChordGuess } from '../analysis/chroma';
import { OnsetDetector } from '../analysis/onsets';
import { newEnergySpectrum, windowSpectrum } from '../analysis/spectrum';
import { refineByTiming, strumFrames } from '../analysis/strum';
import {
  decide,
  verifyNote,
  verifyNotes,
  type ExpectedNote,
  type Leniency,
  type NoteCheck,
  type Verdict,
} from '../analysis/verify';

export const ANALYSIS_RATE = 22050;
const RING_SECONDS = 6;
/** A note is judged this long after its onset; a strum this long after its last pluck. */
const NOTE_WAIT_S = 0.3;
const CHORD_WAIT_S = 0.5;
/** Plucks closer than this are one strum (longer than the onset detector's 120 ms ripple guard). */
const STRUM_GAP_S = 0.13;
const APP_MASK_S = 0.06;

export interface Expectation {
  id: string;
  kind: 'note' | 'chord';
  /** One note for 'note'; the chord's sounding notes for 'chord'. */
  notes: ExpectedNote[];
  muted?: { string: number; midi: number }[];
  leniency?: Leniency;
  a4Hz?: number;
}

/** An expected note or chord at a time on the listener's clock (tab play-along, timeline mode). */
export interface TimedExpectation extends Expectation {
  t: number;
}

/** How far an onset may be from its beat to count as an attempt at it. */
const TIMELINE_WINDOW_S = 0.18;

export type ListenerEvent =
  | { type: 'onset'; t: number }
  /** `deltaMs`: onset minus the expected time (timeline mode). */
  | { type: 'note'; id: string; t: number; check: NoteCheck; deltaMs?: number }
  | {
      type: 'chord';
      id: string;
      start: number;
      end: number;
      verdict: Verdict;
      deltaMs?: number;
      /** Plucks heard in the strum, and the RMS of the analysed audio (diagnostics). */
      plucks?: number;
      rms?: number;
    }
  | { type: 'suggest'; t: number; guesses: ChordGuess[] }
  /** A strum while a single note was expected: not judged (the string check wants one string). */
  | { type: 'strumIgnored'; id: string; t: number }
  | { type: 'level'; t: number; rms: number };

const rmsOf = (x: Float32Array) => {
  let acc = 0;
  for (const v of x) acc += v * v;
  return x.length ? Math.sqrt(acc / x.length) : 0;
};

export class ListenerCore {
  private readonly ring = new Float32Array(ANALYSIS_RATE * RING_SECONDS);
  private written = 0;
  private readonly onsets = new OnsetDetector({ sampleRate: ANALYSIS_RATE });
  private expectation: Expectation | null = null;
  private appSounds: number[] = [];
  /** A note waiting to be judged, or a strum still collecting plucks. */
  private pending: {
    start: number;
    end: number;
    count: number;
    item?: TimedExpectation;
  } | null = null;
  private timeline: TimedExpectation[] = [];
  private readonly judgedIds = new Set<string>();
  private suggest = false;
  private lastSuggest = 0;
  private levelAcc = 0;
  private levelN = 0;

  /** Seconds of audio pushed so far: the listener's clock. */
  get now(): number {
    return this.written / ANALYSIS_RATE;
  }

  expect(e: Expectation | null): void {
    this.expectation = e;
    this.timeline = [];
    this.pending = null;
  }

  /** Timeline mode: each onset is an attempt at the nearest unjudged expected beat. */
  expectTimeline(items: TimedExpectation[]): void {
    this.expectation = null;
    this.timeline = items;
    if (this.pending && !this.pending.item) this.pending = null;
  }

  /** Free play: post chord suggestions ("What am I playing?") about four times a second. */
  setSuggest(on: boolean): void {
    this.suggest = on;
  }

  /** The app started a sound of its own at listener time `t` (seconds): ignore onsets near it. */
  appSound(t: number): void {
    this.appSounds = [...this.appSounds.filter((a) => a > this.now - 5), t];
  }

  push(samples: Float32Array): ListenerEvent[] {
    const events: ListenerEvent[] = [];
    for (let i = 0; i < samples.length; i++) {
      this.ring[(this.written + i) % this.ring.length] = samples[i]!;
      this.levelAcc += samples[i]! * samples[i]!;
    }
    this.written += samples.length;
    this.levelN += samples.length;
    if (this.levelN >= ANALYSIS_RATE / 10) {
      events.push({ type: 'level', t: this.now, rms: Math.sqrt(this.levelAcc / this.levelN) });
      this.levelAcc = 0;
      this.levelN = 0;
    }
    for (const t of this.onsets.push(samples)) {
      if (this.appSounds.some((a) => Math.abs(a - t) <= APP_MASK_S)) continue;
      events.push({ type: 'onset', t });
      this.onOnset(t);
    }
    const judged = this.judgeIfDue();
    if (judged) events.push(judged);
    if (this.suggest && this.now - this.lastSuggest >= 0.25 && this.now > 0.6) {
      this.lastSuggest = this.now;
      const spec = windowSpectrum(this.slice(this.now - 0.5, this.now), ANALYSIS_RATE, 0, {
        n: 8192,
        delayS: 0,
        durationS: 0.5,
      });
      events.push({
        type: 'suggest',
        t: this.now,
        guesses: guessChords(chroma(spec, ANALYSIS_RATE)),
      });
    }
    return events;
  }

  private onOnset(t: number): void {
    if (!this.expectation && this.timeline.length) {
      if (this.pending && t - this.pending.end <= STRUM_GAP_S) {
        this.pending.end = t;
        this.pending.count++;
        return;
      }
      if (this.pending) return; // still waiting to judge the previous beat
      let best: TimedExpectation | undefined;
      for (const item of this.timeline)
        if (!this.judgedIds.has(item.id) && Math.abs(item.t - t) <= TIMELINE_WINDOW_S)
          if (!best || Math.abs(item.t - t) < Math.abs(best.t - t)) best = item;
      if (best) this.pending = { start: t, end: t, count: 1, item: best };
      return;
    }
    const e = this.expectation;
    if (!e) return;
    // Plucks within 80 ms of each other are one strum.
    if (this.pending && t - this.pending.end <= STRUM_GAP_S) {
      this.pending.end = t;
      this.pending.count++;
    } else if (!this.pending) this.pending = { start: t, end: t, count: 1 };
  }

  private judgeIfDue(): ListenerEvent | null {
    const p = this.pending;
    const e = p?.item ?? this.expectation;
    if (!e || !p) return null;
    const wait = e.kind === 'note' ? NOTE_WAIT_S : CHORD_WAIT_S;
    // A note waits from its first pluck; a strum from its last.
    if (this.now < p.end + wait) return null;
    this.pending = null;
    const timed = p.item ? { deltaMs: (p.start - p.item.t) * 1000 } : {};
    if (p.item) this.judgedIds.add(p.item.id);
    const opts = {
      ...(e.leniency ? { leniency: e.leniency } : {}),
      ...(e.a4Hz ? { a4Hz: e.a4Hz } : {}),
    };
    if (e.kind === 'note') {
      if (p.count > 1 && !p.item) return { type: 'strumIgnored', id: e.id, t: p.start };
      const from = p.start - 0.3;
      const x = this.slice(from, p.start + NOTE_WAIT_S);
      const spec = newEnergySpectrum(
        x,
        ANALYSIS_RATE,
        Math.round((p.start - from) * ANALYSIS_RATE),
      );
      return {
        type: 'note',
        id: e.id,
        t: p.start,
        check: verifyNote(spec, ANALYSIS_RATE, e.notes[0]!.midi, opts),
        ...timed,
      };
    }
    const from = p.start - 0.1;
    const x = this.slice(from, p.end + CHORD_WAIT_S);
    const endAt = Math.round((p.end - from) * ANALYSIS_RATE);
    const spec = windowSpectrum(x, ANALYSIS_RATE, endAt, { n: 8192, durationS: 0.45 });
    const leniency = e.leniency ?? 'standard';
    const v = verifyNotes(spec, ANALYSIS_RATE, e.notes, {
      ...opts,
      ...(e.muted ? { muted: e.muted } : {}),
    });
    const frames = strumFrames(
      x,
      Math.round(0.07 * ANALYSIS_RATE),
      endAt + Math.round(0.08 * ANALYSIS_RATE),
    );
    const refined = refineByTiming(
      v.perNote,
      frames,
      ANALYSIS_RATE,
      e.a4Hz ? { a4Hz: e.a4Hz } : {},
    );
    return {
      type: 'chord',
      id: e.id,
      start: p.start,
      end: p.end,
      verdict: decide(refined, v.extra, leniency),
      ...timed,
      plucks: p.count,
      rms: rmsOf(x.subarray(endAt)),
    };
  }

  /** Audio between listener times `a` and `b` (zeros where it is not in the ring any more). */
  slice(a: number, b: number): Float32Array {
    const from = Math.round(a * ANALYSIS_RATE);
    const to = Math.round(b * ANALYSIS_RATE);
    const out = new Float32Array(Math.max(0, to - from));
    const oldest = this.written - this.ring.length;
    for (let i = from; i < to; i++)
      if (i >= Math.max(0, oldest) && i < this.written)
        out[i - from] = this.ring[i % this.ring.length]!;
    return out;
  }
}
