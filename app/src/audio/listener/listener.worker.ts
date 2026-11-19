/** The listening engine's worker: resamples microphone blocks to 22.05 kHz and runs ListenerCore. */
import { Resampler } from '../dsp/resample';
import { ANALYSIS_RATE, ListenerCore, type Expectation, type ListenerEvent } from './core';

export type ToWorker =
  | { type: 'init'; sampleRate: number }
  | { type: 'audio'; samples: Float32Array }
  | { type: 'expect'; expectation: Expectation | null }
  | { type: 'appSound'; t: number }
  | { type: 'suggest'; on: boolean };

export type FromWorker =
  { type: 'events'; events: ListenerEvent[] } | { type: 'cost'; share: number };

let core = new ListenerCore();
let resampler: Resampler | null = null;
let busyMs = 0;
let audioS = 0;

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const m = event.data;
  switch (m.type) {
    case 'init':
      core = new ListenerCore();
      resampler = new Resampler(m.sampleRate, ANALYSIS_RATE);
      return;
    case 'audio': {
      if (!resampler) return;
      const t0 = performance.now();
      const events = core.push(resampler.push(m.samples));
      busyMs += performance.now() - t0;
      audioS += m.samples.length / resampler.inRate;
      if (events.length) postMessage({ type: 'events', events } satisfies FromWorker);
      if (audioS >= 5) {
        postMessage({ type: 'cost', share: busyMs / 1000 / audioS } satisfies FromWorker);
        busyMs = 0;
        audioS = 0;
      }
      return;
    }
    case 'expect':
      core.expect(m.expectation);
      return;
    case 'appSound':
      core.appSound(m.t);
      return;
    case 'suggest':
      core.setSuggest(m.on);
  }
};
