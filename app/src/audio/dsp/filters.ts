/** Small filters for analysis (not real-time effects). */

/**
 * Low-pass `input` into `out` with `passes` cascaded second-order Butterworth sections
 * (RBJ cookbook, Q = 1/√2). `out` may be the same array as `input`.
 */
export function lowpass(
  input: ArrayLike<number>,
  out: Float32Array,
  sampleRate: number,
  cutoffHz: number,
  passes = 2,
): Float32Array {
  const n = Math.min(input.length, out.length);
  const w0 = (2 * Math.PI * Math.min(cutoffHz, sampleRate * 0.45)) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b0 = (1 - cos) / 2 / a0;
  const b1 = (1 - cos) / a0;
  const b2 = b0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  for (let i = 0; i < n; i++) out[i] = input[i] ?? 0;
  for (let pass = 0; pass < passes; pass++) {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < n; i++) {
      const x = out[i]!;
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      out[i] = y;
    }
  }
  return out;
}
