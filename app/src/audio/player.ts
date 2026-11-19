/**
 * Plays reference tones and shapes through the shared AudioContext.
 * Tones are rendered once per pitch and cached; playback is scheduled on the audio clock.
 */
import { midiToHz } from '@core/theory/pitch';
import type { Shape } from '@core/theory/types';
import { renderPluck } from './dsp/karplus';
import { audioEngine } from './engine';

const cache = new Map<string, AudioBuffer>();
let output: GainNode | null = null;

/** The shared output bus (tab playback uses it too). */
export function master(context: AudioContext): GainNode {
  if (!output || output.context !== context) {
    output = context.createGain();
    output.gain.value = 0.8;
    output.connect(context.destination);
  }
  return output;
}

/** A plucked-string tone for `midi`, rendered once and cached. */
export function bufferFor(context: AudioContext, midi: number, a4Hz: number): AudioBuffer {
  const key = `${context.sampleRate}:${a4Hz}:${midi}`;
  let buffer = cache.get(key);
  if (!buffer) {
    const samples = renderPluck(midiToHz(midi, a4Hz), context.sampleRate, {
      seconds: 2.5,
      seed: midi,
    });
    buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.copyToChannel(samples, 0);
    cache.set(key, buffer);
  }
  return buffer;
}

export interface NoteEvent {
  midi: number;
  /** Seconds after "now". */
  offset: number;
  gain?: number;
}

/** Schedule notes; resolves with the audio time the last one finishes. Call from a user gesture. */
export async function playNotes(notes: NoteEvent[], a4Hz = 440): Promise<number> {
  const context = await audioEngine.unlock();
  const start = context.currentTime + 0.03;
  let end = start;
  for (const note of notes) {
    const source = context.createBufferSource();
    source.buffer = bufferFor(context, note.midi, a4Hz);
    const gain = context.createGain();
    gain.gain.value = note.gain ?? 0.7;
    source.connect(gain).connect(master(context));
    const when = start + note.offset;
    source.start(when);
    end = Math.max(end, when + source.buffer.duration);
  }
  return end;
}

export const playMidi = (midi: number, a4Hz = 440) => playNotes([{ midi, offset: 0 }], a4Hz);

export type ShapePlayback = 'strum' | 'arpeggio';

/**
 * What a shape sounds like: a strum (low string to high, 35 ms apart) or the notes one by one
 * from low to high (each pitch once).
 */
export function shapeNotes(
  shape: Pick<Shape, 'marks'>,
  mode: ShapePlayback,
  groups?: readonly string[],
): NoteEvent[] {
  const marks = shape.marks.filter(
    (m) => m.role !== 'ghost' && (!groups?.length || m.groups.some((g) => groups.includes(g))),
  );
  if (mode === 'strum') {
    return [...marks]
      .sort((a, b) => b.string - a.string || a.fret - b.fret)
      .filter((mark, i, list) => i === 0 || list[i - 1]!.string !== mark.string)
      .map((mark, i) => ({ midi: mark.midi, offset: i * 0.035, gain: 0.55 }));
  }
  const pitches = [...new Set(marks.map((m) => m.midi))].sort((a, b) => a - b);
  return pitches.map((midi, i) => ({ midi, offset: i * 0.28 }));
}
