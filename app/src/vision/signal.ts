/** 1-D and 2-D helpers for the tracker: Gaussian blur (OpenCV-compatible kernel sizes), medians, percentiles. */

const kernelCache = new Map<number, Float32Array>();

/** Gaussian kernel as OpenCV picks it for float images: size = round(σ·8 + 1) | 1. */
export function gaussianKernel(sigma: number): Float32Array {
  const cached = kernelCache.get(sigma);
  if (cached) return cached;
  const size = Math.max(3, Math.round(sigma * 8 + 1) | 1);
  const radius = (size - 1) / 2;
  const k = new Float32Array(size);
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - radius;
    k[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += k[i]!;
  }
  for (let i = 0; i < size; i++) k[i]! /= sum;
  kernelCache.set(sigma, k);
  return k;
}

/** Reflect-101 index (OpenCV's default border): -1 → 1, n → n-2. */
export function reflect101(i: number, n: number): number {
  if (n === 1) return 0;
  while (i < 0 || i >= n) i = i < 0 ? -i : 2 * n - 2 - i;
  return i;
}

/** Blur a 1-D signal in place into `out` (may not alias `input`). */
export function blur1D(input: ArrayLike<number>, out: Float32Array, sigma: number): Float32Array {
  const k = gaussianKernel(sigma);
  const r = (k.length - 1) / 2;
  const n = input.length;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = -r; j <= r; j++) s += k[j + r]! * (input[reflect101(i + j, n)] ?? 0);
    out[i] = s;
  }
  return out;
}

/** Separable Gaussian blur of a w×h float image. */
export function blur2D(
  src: Float32Array,
  w: number,
  h: number,
  sigma: number,
  tmp: Float32Array,
  out: Float32Array,
): void {
  const k = gaussianKernel(sigma);
  const r = (k.length - 1) / 2;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = -r; j <= r; j++) s += k[j + r]! * src[row + reflect101(x + j, w)]!;
      tmp[row + x] = s;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let j = -r; j <= r; j++) s += k[j + r]! * tmp[reflect101(y + j, h) * w + x]!;
      out[y * w + x] = s;
    }
  }
}

/** Median of values[0..n) (numpy semantics: mean of the two middle values when n is even). Sorts `values`. */
export function median(values: Float32Array | number[], n = values.length): number {
  if (n === 0) return 0;
  const view =
    values instanceof Float32Array
      ? values.subarray(0, n).sort()
      : values.slice(0, n).sort((a, b) => a - b);
  const mid = n >> 1;
  return n % 2 ? view[mid]! : 0.5 * (view[mid - 1]! + view[mid]!);
}

/** Percentile with linear interpolation (numpy default). */
export function percentile(values: ArrayLike<number>, p: number): number {
  const sorted = Float64Array.from(values).sort();
  if (sorted.length === 0) return 0;
  const pos = ((sorted.length - 1) * p) / 100;
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}
