/**
 * Look-ahead metronome (docs/specs/02-audio.md §5): a 25 ms timer schedules every click due in the
 * next 100 ms on the audio clock, so timing does not depend on the main thread.
 */
import { announceAppSound } from './appSounds';
import { clicksUntil, type BeatEvent, type MeterSpec } from './beats';
import { renderClick } from './dsp/karplus';
import { audioEngine } from './engine';

const LOOKAHEAD_S = 0.1;
const TIMER_MS = 25;

const PITCH: Record<BeatEvent['kind'], number> = { bar: 1760, group: 1320, beat: 1100, sub: 880 };
const LEVEL: Record<BeatEvent['kind'], number> = { bar: 0.9, group: 0.7, beat: 0.6, sub: 0.3 };

export class Metronome {
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;
  private nextIndex = 0;
  private buffers = new Map<BeatEvent['kind'], AudioBuffer>();
  private scheduled: BeatEvent[] = [];
  private meter: MeterSpec;

  constructor(meter: MeterSpec) {
    this.meter = { ...meter };
  }

  get running(): boolean {
    return this.timer !== null;
  }

  async start(): Promise<void> {
    if (this.running) return;
    const context = await audioEngine.unlock();
    this.context = context;
    for (const kind of Object.keys(PITCH) as BeatEvent['kind'][]) {
      const samples = renderClick(PITCH[kind], context.sampleRate, LEVEL[kind]);
      const buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.copyToChannel(samples, 0);
      this.buffers.set(kind, buffer);
    }
    this.startTime = context.currentTime + 0.08;
    this.nextIndex = 0;
    this.scheduled = [];
    this.tick();
    this.timer = setInterval(() => this.tick(), TIMER_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.scheduled = [];
  }

  /** Change tempo or meter while running; the change takes effect from the next click. */
  update(meter: MeterSpec): void {
    if (this.running && this.context) {
      const nextTime = this.scheduled.length
        ? this.scheduled[this.scheduled.length - 1]!.time + 60 / meter.bpm / meter.subdivision
        : this.context.currentTime + 0.05;
      // Restart counting from the next bar line so accents stay on the right beat.
      const clicksPerBar = meter.beatsPerBar * meter.subdivision;
      this.nextIndex = Math.ceil(this.nextIndex / clicksPerBar) * clicksPerBar;
      this.startTime = nextTime - this.nextIndex * (60 / meter.bpm / meter.subdivision);
    }
    this.meter = { ...meter };
  }

  /** The click most recently heard (accounting for output latency), for beat lights. */
  current(): BeatEvent | null {
    if (!this.context) return null;
    const heard = this.context.currentTime - (this.context.outputLatency || 0);
    let latest: BeatEvent | null = null;
    for (const event of this.scheduled) if (event.time <= heard) latest = event;
    return latest;
  }

  private tick() {
    const context = this.context;
    if (!context) return;
    const due = clicksUntil(
      this.meter,
      this.startTime,
      this.nextIndex,
      context.currentTime + LOOKAHEAD_S,
    );
    for (const event of due) {
      const source = context.createBufferSource();
      source.buffer = this.buffers.get(event.kind) ?? null;
      source.connect(context.destination);
      source.start(Math.max(event.time, context.currentTime));
      announceAppSound(Math.max(event.time, context.currentTime));
      this.nextIndex = event.index + 1;
    }
    this.scheduled = [...this.scheduled, ...due].slice(-32);
  }
}
