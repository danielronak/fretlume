/**
 * Test signals (also used by fixture generation): sines and a plucked-string-like tone with
 * decaying, slightly inharmonic overtones, plus seeded noise.
 */

/** Small seeded PRNG (mulberry32) so tests are deterministic. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sine(
  fHz: number,
  seconds: number,
  sampleRate: number,
  amplitude = 0.5,
): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < out.length; i++)
    out[i] = amplitude * Math.sin((2 * Math.PI * fHz * i) / sampleRate);
  return out;
}

/** A guitar-like pluck: 12 partials, higher ones decaying faster, stiffness B ≈ 1e-4. */
export function pluck(
  fHz: number,
  seconds: number,
  sampleRate: number,
  options: { amplitude?: number; seed?: number; inharmonicity?: number } = {},
): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  const random = rng(options.seed ?? 1);
  const b = options.inharmonicity ?? 1e-4;
  for (let h = 1; h <= 12; h++) {
    const fh = h * fHz * Math.sqrt(1 + b * h * h);
    if (fh > sampleRate / 2.2) break;
    const amp = (1 / h) * (0.6 + 0.4 * random());
    const decay = 1.2 + 0.9 * h; // per second
    const phase = random() * 2 * Math.PI;
    for (let i = 0; i < out.length; i++) {
      const t = i / sampleRate;
      out[i]! += amp * Math.exp(-decay * t) * Math.sin(2 * Math.PI * fh * t + phase);
    }
  }
  let peak = 0;
  for (const s of out) peak = Math.max(peak, Math.abs(s));
  const scale = (options.amplitude ?? 0.6) / (peak || 1);
  for (let i = 0; i < out.length; i++) out[i]! *= scale;
  return out;
}

/** Add white noise so the signal-to-noise ratio (by RMS) is `snrDb`. */
export function withNoise(signal: Float32Array, snrDb: number, seed = 7): Float32Array {
  let power = 0;
  for (const s of signal) power += s * s;
  const rms = Math.sqrt(power / signal.length);
  const noiseRms = rms / 10 ** (snrDb / 20);
  const random = rng(seed);
  const out = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    // Uniform noise in [-a, a] has RMS a/√3.
    out[i] = signal[i]! + (random() * 2 - 1) * noiseRms * Math.sqrt(3);
  }
  return out;
}
