/**
 * A small neural-network runtime for NeckNet (docs/specs/01-vision.md §8; DECISIONS D-019): runs the
 * op list written by ml/train/export.py — convolutions (1×1, 3×3, depthwise) with folded batch norm,
 * ReLU6, add, nearest ×2 upsampling, global average pooling and a linear layer. Channel-major float32.
 * Pure: no DOM, no globals.
 */

export interface Tensor {
  c: number;
  h: number;
  w: number;
  data: Float32Array;
}

export type Op =
  | {
      op: 'conv';
      in: string;
      out: string;
      cin: number;
      cout: number;
      k: number;
      stride: number;
      groups: number;
      relu6: boolean;
      w: number;
      b: number;
    }
  | { op: 'add'; a: string; b: string; out: string }
  | { op: 'up2'; in: string; like: string; out: string }
  | { op: 'gap'; in: string; out: string }
  | { op: 'linear'; in: string; out: string; cin: number; cout: number; w: number; b: number };

export interface Manifest {
  format: 'fretlume-nn';
  version: 1;
  dtype: 'float16';
  /** [channels, height, width] */
  input: [number, number, number];
  channelOrder: 'BGR' | 'RGB';
  outputs: Record<string, string>;
  ops: Op[];
}

/** IEEE half → float. */
export function halfToFloat(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? Number.NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

export function decodeHalf(bytes: ArrayBuffer): Float32Array {
  const halves = new Uint16Array(bytes);
  const out = new Float32Array(halves.length);
  for (let i = 0; i < halves.length; i++) out[i] = halfToFloat(halves[i]!);
  return out;
}

const relu6 = (v: number) => (v < 0 ? 0 : v > 6 ? 6 : v);

function conv(x: Tensor, op: Extract<Op, { op: 'conv' }>, weights: Float32Array): Tensor {
  const { cin, cout, k, stride, groups } = op;
  const pad = k >> 1;
  const h = Math.floor((x.h + 2 * pad - k) / stride) + 1;
  const w = Math.floor((x.w + 2 * pad - k) / stride) + 1;
  const out = new Float32Array(cout * h * w);
  const hw = h * w;
  const src = x.data;
  const xhw = x.h * x.w;
  if (k === 1 && groups === 1 && stride === 1) {
    // Pointwise: out[co] = b[co] + Σ w[co,ci] · in[ci]. Four output channels per pass, so each input
    // value is loaded once for four multiply-adds.
    let co = 0;
    for (; co + 4 <= cout; co += 4) {
      const o0 = co * hw;
      const o1 = o0 + hw;
      const o2 = o1 + hw;
      const o3 = o2 + hw;
      out.fill(weights[op.b + co]!, o0, o1);
      out.fill(weights[op.b + co + 1]!, o1, o2);
      out.fill(weights[op.b + co + 2]!, o2, o3);
      out.fill(weights[op.b + co + 3]!, o3, o3 + hw);
      for (let ci = 0; ci < cin; ci++) {
        const w0 = weights[op.w + co * cin + ci]!;
        const w1 = weights[op.w + (co + 1) * cin + ci]!;
        const w2 = weights[op.w + (co + 2) * cin + ci]!;
        const w3 = weights[op.w + (co + 3) * cin + ci]!;
        const s = ci * xhw;
        for (let p = 0; p < hw; p++) {
          const v = src[s + p]!;
          out[o0 + p]! += w0 * v;
          out[o1 + p]! += w1 * v;
          out[o2 + p]! += w2 * v;
          out[o3 + p]! += w3 * v;
        }
      }
    }
    for (; co < cout; co++) {
      const o = co * hw;
      out.fill(weights[op.b + co]!, o, o + hw);
      for (let ci = 0; ci < cin; ci++) {
        const wv = weights[op.w + co * cin + ci]!;
        const s = ci * xhw;
        for (let p = 0; p < hw; p++) out[o + p]! += wv * src[s + p]!;
      }
    }
  } else if (groups === cin && groups === cout) {
    // Depthwise k×k.
    for (let c = 0; c < cout; c++) {
      const wb = op.w + c * k * k;
      const bias = weights[op.b + c]!;
      const s = c * xhw;
      const o = c * hw;
      for (let oy = 0; oy < h; oy++) {
        for (let ox = 0; ox < w; ox++) {
          let acc = bias;
          const iy0 = oy * stride - pad;
          const ix0 = ox * stride - pad;
          for (let ky = 0; ky < k; ky++) {
            const iy = iy0 + ky;
            if (iy < 0 || iy >= x.h) continue;
            const row = s + iy * x.w;
            for (let kx = 0; kx < k; kx++) {
              const ix = ix0 + kx;
              if (ix < 0 || ix >= x.w) continue;
              acc += weights[wb + ky * k + kx]! * src[row + ix]!;
            }
          }
          out[o + oy * w + ox] = acc;
        }
      }
    }
  } else if (groups === 1) {
    // Dense k×k (the stem): accumulate one input channel and kernel tap at a time.
    for (let co = 0; co < cout; co++) out.fill(weights[op.b + co]!, co * hw, (co + 1) * hw);
    for (let co = 0; co < cout; co++) {
      const o = co * hw;
      for (let ci = 0; ci < cin; ci++) {
        const s = ci * xhw;
        for (let ky = 0; ky < k; ky++) {
          for (let kx = 0; kx < k; kx++) {
            const wv = weights[op.w + ((co * cin + ci) * k + ky) * k + kx]!;
            for (let oy = 0; oy < h; oy++) {
              const iy = oy * stride - pad + ky;
              if (iy < 0 || iy >= x.h) continue;
              const row = s + iy * x.w;
              const orow = o + oy * w;
              for (let ox = 0; ox < w; ox++) {
                const ix = ox * stride - pad + kx;
                if (ix < 0 || ix >= x.w) continue;
                out[orow + ox]! += wv * src[row + ix]!;
              }
            }
          }
        }
      }
    }
  } else {
    throw new Error(`unsupported conv: groups ${groups}, cin ${cin}, cout ${cout}`);
  }
  if (op.relu6) for (let i = 0; i < out.length; i++) out[i] = relu6(out[i]!);
  return { c: cout, h, w, data: out };
}

function add(a: Tensor, b: Tensor): Tensor {
  const out = new Float32Array(a.data.length);
  for (let i = 0; i < out.length; i++) out[i] = a.data[i]! + b.data[i]!;
  return { ...a, data: out };
}

/** Nearest-neighbour ×2, cropped to `like`'s size. */
function up2(x: Tensor, like: Tensor): Tensor {
  const { h, w } = like;
  const out = new Float32Array(x.c * h * w);
  for (let c = 0; c < x.c; c++)
    for (let y = 0; y < h; y++) {
      const srow = c * x.h * x.w + (y >> 1) * x.w;
      const orow = (c * h + y) * w;
      for (let xx = 0; xx < w; xx++) out[orow + xx] = x.data[srow + (xx >> 1)]!;
    }
  return { c: x.c, h, w, data: out };
}

function gap(x: Tensor): Tensor {
  const out = new Float32Array(x.c);
  const n = x.h * x.w;
  for (let c = 0; c < x.c; c++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += x.data[c * n + i]!;
    out[c] = s / n;
  }
  return { c: x.c, h: 1, w: 1, data: out };
}

function linear(x: Tensor, op: Extract<Op, { op: 'linear' }>, weights: Float32Array): Tensor {
  const out = new Float32Array(op.cout);
  for (let o = 0; o < op.cout; o++) {
    let s = weights[op.b + o]!;
    for (let i = 0; i < op.cin; i++) s += weights[op.w + o * op.cin + i]! * x.data[i]!;
    out[o] = s;
  }
  return { c: op.cout, h: 1, w: 1, data: out };
}

export class Network {
  constructor(
    readonly manifest: Manifest,
    readonly weights: Float32Array,
  ) {}

  static fromBuffers(manifest: Manifest, bin: ArrayBuffer): Network {
    if (manifest.format !== 'fretlume-nn' || manifest.dtype !== 'float16')
      throw new Error('unknown model format');
    return new Network(manifest, decodeHalf(bin));
  }

  /** Run on a [c, h, w] input; returns every named output. Intermediate tensors are freed when unused. */
  run(input: Tensor): Record<string, Tensor> {
    const [c, h, w] = this.manifest.input;
    if (input.c !== c || input.h !== h || input.w !== w) throw new Error('input shape mismatch');
    const values = new Map<string, Tensor>([['input', input]]);
    const lastUse = new Map<string, number>();
    this.manifest.ops.forEach((op, i) => {
      for (const key of ['in', 'a', 'b', 'like'] as const)
        if (key in op) lastUse.set((op as Record<string, unknown>)[key] as string, i);
    });
    const keep = new Set(Object.values(this.manifest.outputs));
    const get = (name: string) => {
      const t = values.get(name);
      if (!t) throw new Error(`missing tensor ${name}`);
      return t;
    };
    this.manifest.ops.forEach((op, i) => {
      let out: Tensor;
      switch (op.op) {
        case 'conv':
          out = conv(get(op.in), op, this.weights);
          break;
        case 'add':
          out = add(get(op.a), get(op.b));
          break;
        case 'up2':
          out = up2(get(op.in), get(op.like));
          break;
        case 'gap':
          out = gap(get(op.in));
          break;
        case 'linear':
          out = linear(get(op.in), op, this.weights);
          break;
      }
      values.set(op.out, out);
      for (const [name, at] of lastUse) if (at === i && !keep.has(name)) values.delete(name);
    });
    return Object.fromEntries(
      Object.entries(this.manifest.outputs).map(([key, name]) => [key, get(name)]),
    );
  }
}
