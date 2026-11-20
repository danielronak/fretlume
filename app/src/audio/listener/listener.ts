/**
 * The listening engine on the main thread (phase 6 task 6.3): feeds microphone blocks to the worker,
 * sets what is expected, and tells it when the app makes a sound of its own (self-masking). Times
 * in events are seconds on the listener's clock (audio captured since `start`); `toListenerTime`
 * converts an AudioContext time.
 */
import { onAppSound } from '../appSounds';
import { audioEngine } from '../engine';
import { microphone } from '../microphone';
import type { Expectation, ListenerEvent, TimedExpectation } from './core';
import type { FromWorker, ToWorker } from './listener.worker';

type Handler = (event: ListenerEvent) => void;

class Listener {
  private worker: Worker | null = null;
  private stopBlocks: (() => void) | null = null;
  private stopAppSounds: (() => void) | null = null;
  private readonly handlers = new Set<Handler>();
  /** AudioContext time of the listener's t = 0. */
  private epoch = 0;
  /** Worker CPU share of real time (G6.6 in the field), updated every 5 s. */
  cost = 0;

  get running(): boolean {
    return this.worker !== null;
  }

  /** Start listening; the microphone must be running. */
  start(): void {
    if (this.worker) return;
    const snap = microphone.getSnapshot();
    if (snap.status !== 'running') throw new Error('microphone is not running');
    this.worker = new Worker(new URL('./listener.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
      if (e.data.type === 'cost') this.cost = e.data.share;
      else for (const ev of e.data.events) for (const h of this.handlers) h(ev);
    };
    this.post({ type: 'init', sampleRate: snap.sampleRate });
    this.stopAppSounds = onAppSound((t) => this.appSound(t));
    let first = true;
    this.stopBlocks = microphone.onBlock((block) => {
      if (first) {
        // The first block ended "now": the listener's clock starts one block earlier, minus the
        // input latency the browser reports.
        const ctx = audioEngine.context();
        const latency = (ctx as AudioContext & { baseLatency?: number }).baseLatency ?? 0;
        this.epoch = ctx.currentTime - block.samples.length / snap.sampleRate - latency;
        first = false;
      }
      this.post({ type: 'audio', samples: block.samples });
    });
  }

  stop(): void {
    this.stopBlocks?.();
    this.stopBlocks = null;
    this.stopAppSounds?.();
    this.stopAppSounds = null;
    this.worker?.terminate();
    this.worker = null;
  }

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  expect(expectation: Expectation | null): void {
    this.post({ type: 'expect', expectation });
  }

  /** Timeline mode (tab play-along): items carry listener times (see toListenerTime). */
  expectTimeline(items: TimedExpectation[]): void {
    this.post({ type: 'timeline', items });
  }

  suggest(on: boolean): void {
    this.post({ type: 'suggest', on });
  }

  /** Listener time of an AudioContext time. */
  toListenerTime(contextTime: number): number {
    return contextTime - this.epoch;
  }

  /** The app is about to make (or just made) a sound at this AudioContext time. */
  appSound(contextTime: number): void {
    this.post({ type: 'appSound', t: this.toListenerTime(contextTime) });
  }

  private post(message: ToWorker) {
    this.worker?.postMessage(message);
  }
}

export const listener = new Listener();
