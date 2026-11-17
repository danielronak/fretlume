/**
 * Capture worklet: mixes the input to mono and posts fixed-size blocks to the main thread,
 * with the block's RMS and peak for the level meter. Writes nothing to its output, so the
 * microphone is never heard through the speakers.
 */

declare global {
  // Minimal AudioWorkletGlobalScope declarations (not part of TypeScript's DOM library).
  abstract class AudioWorkletProcessor {
    readonly port: MessagePort;
    constructor(options?: { processorOptions?: Record<string, unknown> });
    abstract process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
  }
  function registerProcessor(
    name: string,
    processor: new (options?: never) => AudioWorkletProcessor,
  ): void;
}

export interface CaptureBlockMessage {
  type: 'block';
  samples: Float32Array;
  rms: number;
  peak: number;
}

class CaptureProcessor extends AudioWorkletProcessor {
  private readonly hop: number;
  private block: Float32Array;
  private filled = 0;
  private sumSquares = 0;
  private peak = 0;

  constructor(options?: { processorOptions?: Record<string, unknown> }) {
    super();
    const hop = Number(options?.processorOptions?.hopSize ?? 1024);
    this.hop = Number.isInteger(hop) && hop >= 128 ? hop : 1024;
    this.block = new Float32Array(this.hop);
  }

  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0];
    const first = channels?.[0];
    if (!channels || !first) return true;
    const count = channels.length;
    for (let i = 0; i < first.length; i++) {
      let sample = 0;
      for (let c = 0; c < count; c++) sample += channels[c]?.[i] ?? 0;
      sample /= count;
      this.block[this.filled++] = sample;
      this.sumSquares += sample * sample;
      const magnitude = Math.abs(sample);
      if (magnitude > this.peak) this.peak = magnitude;
      if (this.filled === this.hop) this.flush();
    }
    return true;
  }

  private flush() {
    const message: CaptureBlockMessage = {
      type: 'block',
      samples: this.block,
      rms: Math.sqrt(this.sumSquares / this.hop),
      peak: this.peak,
    };
    this.port.postMessage(message, [this.block.buffer]);
    this.block = new Float32Array(this.hop);
    this.filled = 0;
    this.sumSquares = 0;
    this.peak = 0;
  }
}

registerProcessor('fretlume-capture', CaptureProcessor as never);
