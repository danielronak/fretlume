/**
 * NeckNet front and back end (phase 4 task 4.5): frame → 288×160 BGR input (letterboxed), network,
 * and decoding of the heads into fretboard corners in frame pixels, presence, orientation and the
 * guitar type. Pure; the runtime is nn.ts.
 */
import type { Pt } from './geometry';
import type { Image } from './image';
import type { Network, Tensor } from './nn';

export const IN_W = 288;
export const IN_H = 160;
export const STRIDE = 4;
export const PROFILES = ['steel-acoustic', 'electric', 'classical'] as const;
export type ProfileId = (typeof PROFILES)[number];

export interface Letterbox {
  /** Input px per frame px. */
  scale: number;
  ox: number;
  oy: number;
}

/**
 * Frame → input placement. Training frames are 1.8:1 with no borders, so frames within 5 % of that
 * (16:9 is 1.78) fill the input and lose a sliver at the edges; others (4:3) are letterboxed.
 */
export function letterbox(width: number, height: number): Letterbox {
  const near = Math.abs(width / height / (IN_W / IN_H) - 1) < 0.05;
  const scale = near
    ? Math.max(IN_W / width, IN_H / height)
    : Math.min(IN_W / width, IN_H / height);
  return { scale, ox: (IN_W - width * scale) / 2, oy: (IN_H - height * scale) / 2 };
}

/**
 * Network input from an RGBA (or gray) frame: area-average resampling into the letterboxed box,
 * channels in B, G, R order as in training, values 0..1, borders black.
 */
export function prepareInput(image: Image, box = letterbox(image.width, image.height)): Tensor {
  const data = new Float32Array(3 * IN_H * IN_W);
  const plane = IN_H * IN_W;
  const inv = 1 / box.scale;
  const { width, height, channels } = image;
  for (let y = 0; y < IN_H; y++) {
    const fy0 = (y - box.oy) * inv;
    const fy1 = fy0 + inv;
    if (fy1 <= 0 || fy0 >= height) continue;
    const y0 = Math.max(0, Math.floor(fy0));
    const y1 = Math.min(height, Math.ceil(fy1));
    for (let x = 0; x < IN_W; x++) {
      const fx0 = (x - box.ox) * inv;
      const fx1 = fx0 + inv;
      if (fx1 <= 0 || fx0 >= width) continue;
      const x0 = Math.max(0, Math.floor(fx0));
      const x1 = Math.min(width, Math.ceil(fx1));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * width + xx) * channels;
          if (channels === 1) {
            r += image.data[i]!;
            g += image.data[i]!;
            b += image.data[i]!;
          } else {
            r += image.data[i]!;
            g += image.data[i + 1]!;
            b += image.data[i + 2]!;
          }
          n++;
        }
      }
      const k = 1 / (255 * Math.max(1, n));
      const p = y * IN_W + x;
      data[p] = b * k;
      data[plane + p] = g * k;
      data[2 * plane + p] = r * k;
    }
  }
  return { c: 3, h: IN_H, w: IN_W, data };
}

const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));

export interface NeckDetection {
  /** Probability that a guitar neck is in view. */
  presence: number;
  /** C0..C3 (nut bass, nut treble, 12th treble, 12th bass) in frame px. */
  corners: Pt[];
  /** Heatmap peak probability per corner. */
  cornerScores: number[];
  /** Probability that the headstock is on the frame's right. */
  headstockRight: number;
  profile: { id: ProfileId; p: number[] };
  /** Fretboard mask probability at stride 4 (IN_H/4 × IN_W/4), for diagnosis. */
  mask: Float32Array;
}

export function decode(head: Tensor, globals: Tensor, box: Letterbox): NeckDetection {
  const { h, w } = head;
  const plane = h * w;
  const corners: Pt[] = [];
  const cornerScores: number[] = [];
  for (let k = 0; k < 4; k++) {
    const base = (1 + k) * plane;
    let best = 0;
    for (let i = 1; i < plane; i++) if (head.data[base + i]! > head.data[base + best]!) best = i;
    const iy = Math.floor(best / w);
    const ix = best % w;
    const dx = head.data[(5 + 2 * k) * plane + best]!;
    const dy = head.data[(6 + 2 * k) * plane + best]!;
    const xIn = (ix + dx) * STRIDE;
    const yIn = (iy + dy) * STRIDE;
    corners.push({ x: (xIn - box.ox) / box.scale, y: (yIn - box.oy) / box.scale });
    cornerScores.push(sigmoid(head.data[base + best]!));
  }
  const g = globals.data;
  const logits = [g[2]!, g[3]!, g[4]!];
  const m = Math.max(...logits);
  const e = logits.map((v) => Math.exp(v - m));
  const sum = e.reduce((a, b) => a + b, 0);
  const p = e.map((v) => v / sum);
  const mask = new Float32Array(plane);
  for (let i = 0; i < plane; i++) mask[i] = sigmoid(head.data[i]!);
  return {
    presence: sigmoid(g[0]!),
    corners,
    cornerScores,
    headstockRight: sigmoid(g[1]!),
    profile: { id: PROFILES[p.indexOf(Math.max(...p))]!, p },
    mask,
  };
}

export function detectNeck(net: Network, image: Image): NeckDetection {
  const box = letterbox(image.width, image.height);
  const out = net.run(prepareInput(image, box));
  return decode(out.head!, out.globals!, box);
}
