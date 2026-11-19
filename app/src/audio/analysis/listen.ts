/**
 * Listening for an expected note or chord in a stretch of audio (the core of the real-time listener
 * and the benches). Self-masking (docs/specs/02-audio.md §1): onsets within `maskMs` of a sound the app
 * itself started are ignored, and only energy that is new at the player's onset is judged — so the
 * app's own reference tone or demo, already sounding, cannot pass for the player. Pure.
 */
import { detectOnsets, strums } from './onsets';
import { newEnergySpectrum, windowSpectrum } from './spectrum';
import { refineByTiming, strumFrames } from './strum';
import {
  decide,
  verifyNote,
  verifyNotes,
  type ExpectedNote,
  type Leniency,
  type NoteCheck,
  type Verdict,
} from './verify';

export interface ListenOptions {
  sampleRate: number;
  leniency?: Leniency;
  a4Hz?: number;
  /** Times (seconds, same clock as the audio) when the app started a sound of its own. */
  appOnsets?: readonly number[];
  maskMs?: number;
}

const masked = (t: number, o: ListenOptions) =>
  (o.appOnsets ?? []).some((a) => Math.abs(a - t) <= (o.maskMs ?? 60) / 1000);

/** The player's onsets in `signal` (seconds from its start), app sounds removed. */
export function playerOnsets(signal: Float32Array, o: ListenOptions, t0 = 0): number[] {
  return detectOnsets(signal, { sampleRate: o.sampleRate })
    .map((t) => t + t0)
    .filter((t) => !masked(t, o));
}

/** A single expected note: the first player onset in the stretch, judged on its new energy. */
export function listenForNote(
  signal: Float32Array,
  midi: number,
  o: ListenOptions & { t0?: number },
): { onset: number | null; check: NoteCheck | null } {
  const t0 = o.t0 ?? 0;
  const onsets = playerOnsets(signal, o, t0);
  if (onsets.length === 0) return { onset: null, check: null };
  const onset = onsets[0]!;
  const at = Math.round((onset - t0) * o.sampleRate);
  const spec = newEnergySpectrum(signal, o.sampleRate, at);
  const opts = {
    ...(o.leniency ? { leniency: o.leniency } : {}),
    ...(o.a4Hz ? { a4Hz: o.a4Hz } : {}),
  };
  return { onset, check: verifyNote(spec, o.sampleRate, midi, opts) };
}

/** A strummed chord: the first player strum (cluster of onsets), judged after its last pluck. */
export function listenForChord(
  signal: Float32Array,
  expected: readonly ExpectedNote[],
  o: ListenOptions & { t0?: number; muted?: { string: number; midi: number }[] },
): { strum: { start: number; end: number } | null; verdict: Verdict | null } {
  const t0 = o.t0 ?? 0;
  const groups = strums(playerOnsets(signal, o, t0));
  const first = groups[0];
  if (!first) return { strum: null, verdict: null };
  const sr = o.sampleRate;
  const end = Math.round((first.end - t0) * sr);
  const spec = windowSpectrum(signal, sr, end, { n: 8192, durationS: 0.45 });
  const leniency = o.leniency ?? 'standard';
  const v = verifyNotes(spec, sr, expected, {
    leniency,
    ...(o.muted ? { muted: o.muted } : {}),
    ...(o.a4Hz ? { a4Hz: o.a4Hz } : {}),
  });
  const frames = strumFrames(
    signal,
    Math.round((first.start - t0 - 0.03) * sr),
    end + Math.round(0.08 * sr),
  );
  const refined = refineByTiming(v.perNote, frames, sr, o.a4Hz ? { a4Hz: o.a4Hz } : {});
  return {
    strum: { start: first.start, end: first.end },
    verdict: decide(refined, v.extra, leniency),
  };
}
