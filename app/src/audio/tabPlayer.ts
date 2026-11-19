/**
 * Tab playback on the audio clock (phase 5 task 5.4). The plan (core/tab/model.ts planVoices) says
 * what sounds when; this schedules it half a second ahead, in chunks, so Stop takes effect within
 * ~50 ms, a loop A–B repeats seamlessly, and the play-along cursor reads the position from the clock.
 */
import { announceAppSound } from './appSounds';
import { barStarts, planVoices, secondsPerTick, type Tab, type Voice } from '@core/tab/model';
import { renderClick } from './dsp/karplus';
import { audioEngine } from './engine';
import { bufferFor, master } from './player';

const AHEAD_S = 0.5;
const TIMER_MS = 50;
/** Pluck attack skipped by legato notes (hammer-on, pull-off): no new pick sound. */
const LEGATO_SKIP_S = 0.015;

export interface PlayOptions {
  tempoPct?: number;
  /** Loop bars [from, to) (0-based, `to` exclusive); without it the tab plays once. */
  loop?: [number, number];
  /** Without a loop: the bar to start from (0-based; default 0). */
  startBar?: number;
  /** One bar of clicks before the music. */
  countIn?: boolean;
  a4Hz?: number;
  onEnd?: () => void;
}

export interface PlayPosition {
  playing: boolean;
  /** Tick in the tab (inside the loop window when looping); negative during the count-in. */
  tick: number;
}

let noise: AudioBuffer | null = null;
function noiseBuffer(context: AudioContext): AudioBuffer {
  if (!noise || noise.sampleRate !== context.sampleRate) {
    const n = Math.round(context.sampleRate * 0.04);
    noise = context.createBuffer(1, n, context.sampleRate);
    const data = noise.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < n; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = ((seed / 2147483647) * 2 - 1) * Math.exp(-i / (n / 4));
    }
  }
  return noise;
}

export class TabPlayer {
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private plan: Voice[] = [];
  private next = 0;
  private pass = 0;
  private origin = 0;
  private windowS = 0;
  private fromTick = 0;
  private toTick = 0;
  private spt = 0;
  private looping = false;
  private options: PlayOptions = {};

  get playing(): boolean {
    return this.timer !== null;
  }

  async play(tab: Tab, options: PlayOptions = {}): Promise<void> {
    this.stop();
    const context = await audioEngine.unlock();
    this.context = context;
    this.options = options;
    const starts = barStarts(tab);
    const last = starts.length - 1;
    const [a, b] = options.loop ?? [options.startBar ?? 0, last];
    this.fromTick = starts[Math.max(0, Math.min(a, last))]!;
    this.toTick = starts[Math.max(1, Math.min(b, last))]!;
    this.looping = options.loop !== undefined;
    this.spt = secondsPerTick(tab, options.tempoPct ?? 100);
    this.windowS = (this.toTick - this.fromTick) * this.spt;
    this.plan = planVoices(tab, {
      tempoPct: options.tempoPct ?? 100,
      fromTick: this.fromTick,
      toTick: this.toTick,
    });
    this.next = 0;
    this.pass = 0;
    let at = context.currentTime + 0.08;
    if (options.countIn) {
      const beats = tab.timeSig[0];
      const beatS = (this.spt * 1920) / tab.timeSig[1];
      for (let i = 0; i < beats; i++) this.click(at + i * beatS, i === 0);
      at += beats * beatS;
    }
    this.origin = at;
    this.tick();
    this.timer = setInterval(() => this.tick(), TIMER_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const now = this.context?.currentTime ?? 0;
    for (const s of this.sources) {
      try {
        s.stop(now);
      } catch {
        // already stopped
      }
    }
    this.sources = [];
  }

  position(): PlayPosition {
    if (!this.context || !this.playing) return { playing: false, tick: this.fromTick };
    const t = this.context.currentTime - this.origin;
    if (t < 0) return { playing: true, tick: this.fromTick + t / this.spt };
    const inWindow = this.looping && this.windowS > 0 ? t % this.windowS : t;
    return { playing: true, tick: this.fromTick + inWindow / this.spt };
  }

  private click(when: number, accent: boolean): void {
    const context = this.context!;
    const samples = renderClick(accent ? 1760 : 1100, context.sampleRate, accent ? 0.9 : 0.6);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.copyToChannel(samples, 0);
    const src = context.createBufferSource();
    src.buffer = buffer;
    src.connect(master(context));
    src.start(when);
    announceAppSound(when);
    this.sources.push(src);
  }

  private tick(): void {
    const context = this.context;
    if (!context) return;
    const horizon = context.currentTime + AHEAD_S;
    for (;;) {
      if (this.next >= this.plan.length) {
        if (!this.looping) {
          // Once: stop when the last note has had time to ring.
          const end = this.origin + this.windowS;
          if (context.currentTime > end + 0.3) {
            this.stop();
            this.options.onEnd?.();
          }
          return;
        }
        this.pass++;
        this.next = 0;
        if (this.plan.length === 0) return;
      }
      const voice = this.plan[this.next]!;
      const offset = this.origin + this.pass * this.windowS;
      if (offset + voice.start > horizon) return;
      this.schedule(voice, offset);
      this.next++;
    }
  }

  private schedule(v: Voice, offset: number): void {
    const context = this.context!;
    if (v.kind === 'legato' && v.gain === 0) return; // a slide target: the glide plays it
    const when = Math.max(context.currentTime, offset + v.start);
    // In a loop, nothing rings past the end of the window into the next pass.
    const end = offset + (this.looping ? Math.min(v.end, this.windowS) : v.end);
    const src = context.createBufferSource();
    const gain = context.createGain();
    if (v.kind === 'noise') {
      src.buffer = noiseBuffer(context);
    } else {
      src.buffer = bufferFor(context, v.midi, this.options.a4Hz ?? 440);
      for (const [t, semis] of v.pitch ?? []) {
        if (t === 0) src.detune.setValueAtTime(semis * 100, when);
        else src.detune.linearRampToValueAtTime(semis * 100, offset + v.start + t);
      }
    }
    gain.gain.setValueAtTime(v.gain, when);
    if (v.damped) gain.gain.setTargetAtTime(0, when + 0.05, 0.04);
    gain.gain.setValueAtTime(v.gain, Math.max(when, end - 0.03));
    gain.gain.linearRampToValueAtTime(0, end);
    src.connect(gain).connect(master(context));
    src.start(when, v.kind === 'legato' ? LEGATO_SKIP_S : 0);
    announceAppSound(when);
    src.stop(end + 0.02);
    this.sources.push(src);
    src.onended = () => {
      this.sources = this.sources.filter((s) => s !== src);
    };
  }
}
