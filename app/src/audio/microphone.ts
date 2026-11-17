/**
 * Microphone capture shared by every feature that listens (meter, tuner, listening engine).
 * One capture at a time; consumers subscribe to its state and to blocks of samples.
 * docs/specs/02-audio.md §1.
 */
import captureWorkletUrl from './worklets/capture.worklet.ts?worker&url';
import type { CaptureBlockMessage } from './worklets/capture.worklet';
import { audioEngine } from './engine';
import { RingBuffer } from './ringBuffer';

export type MicStatus =
  | 'idle'
  | 'requesting'
  | 'running'
  | 'denied'
  | 'unavailable'
  | 'no-device'
  | 'busy'
  | 'lost'
  | 'error';

export interface InputDevice {
  id: string;
  label: string;
}

export interface MicSnapshot {
  status: MicStatus;
  /** The device in use (or last chosen); empty = system default. */
  deviceId: string;
  devices: InputDevice[];
  sampleRate: number;
  /** True when the browser reports it is still cleaning up the sound despite our request. */
  processingOn: boolean;
  message?: string;
}

export interface Block {
  samples: Float32Array;
  rms: number;
  peak: number;
  /** Total samples captured up to the end of this block. */
  endSample: number;
}

/** Seconds of audio kept for analysers. */
const RING_SECONDS = 2;
export const HOP_SIZE = 1024;

const INITIAL: MicSnapshot = {
  status: 'idle',
  deviceId: '',
  devices: [],
  sampleRate: 0,
  processingOn: false,
};

export function classifyError(error: unknown): MicStatus {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-device';
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
  return 'error';
}

class Microphone {
  private snapshot: MicSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();
  private readonly blockListeners = new Set<(block: Block) => void>();
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private workletLoaded: Promise<void> | null = null;
  private watchingDevices = false;
  ring: RingBuffer | null = null;
  /** The newest block's level, for meters that poll. */
  latest = { rms: 0, peak: 0 };

  getSnapshot = (): MicSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Receive every captured block (about 21 ms each at 48 kHz). */
  onBlock(listener: (block: Block) => void): () => void {
    this.blockListeners.add(listener);
    return () => this.blockListeners.delete(listener);
  }

  get capturedSamples(): number {
    return this.ring?.total ?? 0;
  }

  private set(patch: Partial<MicSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Must be called from a user gesture the first time (it unlocks audio). */
  async start(deviceId = this.snapshot.deviceId): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
      this.set({ status: 'unavailable' });
      return;
    }
    this.teardown();
    this.set({ status: 'requesting', deviceId });
    const context = await audioEngine.unlock();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: this.constraints(deviceId) });
    } catch (error) {
      // A remembered device that is gone: fall back to the default once.
      if (deviceId && classifyError(error) === 'no-device') return this.start('');
      this.set({
        status: classifyError(error),
        message: error instanceof Error ? error.message : '',
      });
      return;
    }

    try {
      this.workletLoaded ??= context.audioWorklet.addModule(captureWorkletUrl);
      await this.workletLoaded;
    } catch (error) {
      this.workletLoaded = null;
      stream.getTracks().forEach((track) => track.stop());
      this.set({ status: 'error', message: error instanceof Error ? error.message : '' });
      return;
    }

    this.stream = stream;
    this.ring = new RingBuffer(Math.round(context.sampleRate * RING_SECONDS));
    this.source = context.createMediaStreamSource(stream);
    this.node = new AudioWorkletNode(context, 'fretlume-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCountMode: 'explicit',
      channelCount: 2,
      processorOptions: { hopSize: HOP_SIZE },
    });
    // Keep the node in the rendered graph, silently: its output is all zeros and the gain is 0.
    this.sink = context.createGain();
    this.sink.gain.value = 0;
    this.source.connect(this.node);
    this.node.connect(this.sink).connect(context.destination);
    this.node.port.onmessage = (event: MessageEvent<CaptureBlockMessage>) =>
      this.receive(event.data);

    const track = stream.getAudioTracks()[0];
    const settings = track?.getSettings() ?? {};
    track?.addEventListener('ended', this.onTrackEnded);
    this.set({
      status: 'running',
      deviceId: settings.deviceId && deviceId ? settings.deviceId : deviceId,
      sampleRate: context.sampleRate,
      processingOn:
        settings.echoCancellation === true ||
        settings.noiseSuppression === true ||
        settings.autoGainControl === true,
      message: '',
    });
    await this.refreshDevices();
    this.watchDevices();
  }

  stop(): void {
    this.teardown();
    this.set({ status: 'idle' });
  }

  private constraints(deviceId: string): MediaTrackConstraints {
    // Echo cancellation, noise suppression and automatic gain all damage sustained guitar notes.
    return {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    };
  }

  private receive(message: CaptureBlockMessage) {
    if (message.type !== 'block' || !this.ring) return;
    this.ring.write(message.samples);
    this.latest = { rms: message.rms, peak: message.peak };
    const block: Block = { ...message, endSample: this.ring.total };
    for (const listener of this.blockListeners) listener(block);
  }

  private readonly onTrackEnded = () => {
    this.teardown();
    this.set({ status: 'lost' });
  };

  private teardown() {
    this.node?.port.close();
    this.source?.disconnect();
    this.node?.disconnect();
    this.sink?.disconnect();
    this.stream?.getAudioTracks()[0]?.removeEventListener('ended', this.onTrackEnded);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.source = null;
    this.node = null;
    this.sink = null;
    this.latest = { rms: 0, peak: 0 };
  }

  async refreshDevices(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    const devices = all
      .filter((device) => device.kind === 'audioinput' && device.deviceId !== 'communications')
      .map((device, index) => ({
        id: device.deviceId === 'default' ? '' : device.deviceId,
        label: device.label || `Microphone ${index + 1}`,
      }));
    this.set({ devices });
  }

  private watchDevices() {
    if (this.watchingDevices || !navigator.mediaDevices) return;
    this.watchingDevices = true;
    navigator.mediaDevices.addEventListener('devicechange', () => void this.refreshDevices());
  }
}

export const microphone = new Microphone();
