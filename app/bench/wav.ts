/** Read 16-bit PCM WAV files (mono or the first channel) for the audio benches. */
import { readFileSync } from 'node:fs';

export function readWav(path: string): { samples: Float32Array; sampleRate: number } {
  const b = readFileSync(path);
  let p = 12;
  let sampleRate = 0;
  let channels = 1;
  while (p < b.length) {
    const id = b.toString('ascii', p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') {
      channels = b.readUInt16LE(p + 10);
      sampleRate = b.readUInt32LE(p + 12);
      if (b.readUInt16LE(p + 22) !== 16) throw new Error(`${path}: only 16-bit PCM`);
    } else if (id === 'data') {
      const n = size / 2 / channels;
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = b.readInt16LE(p + 8 + i * 2 * channels) / 32768;
      return { samples, sampleRate };
    }
    p += 8 + size + (size % 2);
  }
  throw new Error(`${path}: no data chunk`);
}
