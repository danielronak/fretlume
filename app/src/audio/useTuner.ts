import { useEffect, useRef, useState } from 'react';
import type { Tuning } from '@core/theory/types';
import { PitchDetector } from './dsp/mpm';
import { toDb } from './level';
import { microphone } from './microphone';
import {
  InTuneTracker,
  interpret,
  PitchSmoother,
  tunerTargets,
  type TunerMode,
  type TunerReading,
} from './tuner';

const WINDOW = 4096;
const SILENCE_DB = -55;

export interface TunerState {
  reading: TunerReading | null;
  inTune: boolean;
  /** In tune for at least 400 ms. */
  held: boolean;
}

const EMPTY: TunerState = { reading: null, inTune: false, held: false };

/** Runs the pitch detector on every captured block while the microphone is on. */
export function useTuner(tuning: Tuning, a4Hz: number, mode: TunerMode): TunerState {
  const [state, setState] = useState<TunerState>(EMPTY);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const detector = new PitchDetector(WINDOW);
    const smoother = new PitchSmoother();
    const tracker = new InTuneTracker();
    const frame = new Float32Array(WINDOW);
    const targets = tunerTargets(tuning, a4Hz);
    let lastKey = '';

    const unsubscribe = microphone.onBlock((block) => {
      const ring = microphone.ring;
      if (!ring) return;
      let smoothed;
      if (toDb(block.rms) < SILENCE_DB) {
        smoothed = smoother.push(null);
      } else {
        ring.readLatest(frame);
        smoothed = smoother.push(detector.detect(frame, microphone.getSnapshot().sampleRate));
      }
      const reading = smoothed.stable ? interpret(smoothed.fHz, targets, modeRef.current) : null;
      const { inTune, held } = tracker.update(reading, performance.now());
      // Re-render only when something visible changes (tenths of a cent).
      const key = reading
        ? `${reading.target.string}|${reading.cents.toFixed(1)}|${reading.range}|${inTune}|${held}`
        : 'none';
      if (key !== lastKey) {
        lastKey = key;
        setState({ reading, inTune, held });
      }
    });
    return () => {
      unsubscribe();
      setState(EMPTY);
    };
  }, [tuning, a4Hz]);

  return state;
}
