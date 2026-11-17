/**
 * Fret-index verification (docs/specs/01-vision.md §5): fret wires alone cannot tell which fret is
 * which, so after a fit we compare shifts of −2…+2 frets by
 *  - the inlay template: markers sit in fret spaces 3, 5, 7, 9, 12 (double), 15, 17, 19, 21 and the other
 *    spaces are plain;
 *  - the nut: wires in front of it, none behind it (the headstock).
 * Pure; samples the image along board coordinates through H.
 */
import { fretX, halfWidth, stringY, type InstrumentModel } from '@core/guitar/instrument';
import { apply, type Mat3 } from './geometry';
import { sampleLuma, type Image } from './image';
import { shiftFrets } from './lock';
import { median } from './signal';

export const INLAY_SPACES = new Set([3, 5, 7, 9, 12, 15, 17, 19, 21]);

export interface IndexVerdict {
  /** Shift (frets) to apply to H with shiftFrets; 0 = the fit's index is right. */
  shift: number;
  /** Score of the chosen shift minus the runner-up (0 = undecided). */
  margin: number;
  scores: { shift: number; inlay: number; nut: number; total: number }[];
  /** Whether the board shows an inlay pattern at all. */
  inlaysSeen: boolean;
}

function lumaAtBoard(image: Image, H: Mat3, x: number, y: number): number {
  const p = apply(H, x, y);
  return sampleLuma(image, p.x, p.y);
}

/** Per fret space 1..maxFret: how much the centre differs from the board (absolute luma deviation). */
function spaceDeviation(image: Image, H: Mat3, model: InstrumentModel, maxFret: number): number[] {
  const values: number[][] = [];
  for (let n = 1; n <= maxFret; n++) {
    const a = fretX(model, n - 1);
    const b = fretX(model, n);
    const xs = [a + 0.35 * (b - a), a + 0.5 * (b - a), a + 0.65 * (b - a)];
    const samples: number[] = [];
    for (const x of xs)
      // Midway between neighbouring strings: where inlays are, and where strings and their
      // shadows are not.
      for (let st = 1; st < model.strings; st++) {
        const yMid = (stringY(model, st, x) + stringY(model, st + 1, x)) / 2;
        for (const dy of [-1.2, 0, 1.2]) {
          const v = lumaAtBoard(image, H, x, yMid + dy);
          if (!Number.isNaN(v)) samples.push(v);
        }
      }
    values.push(samples);
  }
  const board = median(values.flat());
  return values.map((s) =>
    s.length
      ? s
          .map((v) => Math.abs(v - board))
          .sort((p, q) => q - p)
          .slice(0, 8)
          .reduce((p, q) => p + q, 0) / 8
      : NaN,
  );
}

/** Strength of a fret-wire-like ridge across the board at x (best within ±1.5 mm). */
function ridgeAt(image: Image, H: Mat3, model: InstrumentModel, x: number): number {
  const hw = halfWidth(model, Math.max(0, x));
  let best = 0;
  for (let dx = -1.5; dx <= 1.5; dx += 0.5) {
    const values: number[] = [];
    for (let k = -5; k <= 5; k++) {
      const y = (k / 5) * 0.7 * hw;
      const c = lumaAtBoard(image, H, x + dx, y);
      const a = lumaAtBoard(image, H, x + dx - 3, y);
      const b = lumaAtBoard(image, H, x + dx + 3, y);
      if (![a, b, c].some(Number.isNaN)) values.push(Math.abs(c - (a + b) / 2));
    }
    if (values.length >= 6) best = Math.max(best, median(values));
  }
  return best;
}

/**
 * Nut evidence: wires just in front of the nut, none behind it (the headstock). A fit one or more frets
 * off puts real wires where the headstock should be.
 */
function nutScore(image: Image, H: Mat3, model: InstrumentModel): number {
  const front =
    (ridgeAt(image, H, model, fretX(model, 1)) + ridgeAt(image, H, model, fretX(model, 2))) / 2;
  const behind = Math.max(
    ridgeAt(image, H, model, fretX(model, -1)),
    ridgeAt(image, H, model, fretX(model, -2)),
  );
  return (front - behind) / (front + 4);
}

/** Brightness change across the nut (bone, black or brass bar), relative to the board's texture. */
function nutContrast(image: Image, H: Mat3, model: InstrumentModel): number {
  const hw = halfWidth(model, 0);
  const side = (x0: number, x1: number) => {
    const v: number[] = [];
    for (let x = x0; x <= x1; x += 0.75)
      for (let k = -4; k <= 4; k++) {
        const l = lumaAtBoard(image, H, x, (k / 4) * 0.8 * hw);
        if (!Number.isNaN(l)) v.push(l);
      }
    return v.length ? median(v) : NaN;
  };
  const behind = side(-5, -1.5);
  const front = side(1.5, 5);
  const ref = side(fretX(model, 1) * 0.3, fretX(model, 1) * 0.7);
  if ([behind, front, ref].some(Number.isNaN)) return 0;
  return Math.min(2, Math.abs(behind - front) / (Math.abs(front - ref) + 8));
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((p, q) => p + q, 0) / n;
  const mb = b.reduce((p, q) => p + q, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i]! - ma) * (b[i]! - mb);
    saa += (a[i]! - ma) ** 2;
    sbb += (b[i]! - mb) ** 2;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

export function verifyIndex(
  image: Image,
  H: Mat3,
  model: InstrumentModel,
  maxShift = 2,
): IndexVerdict {
  const maxFret = Math.min(17, model.fretCount - maxShift);
  const template = Array.from({ length: maxFret }, (_, i) => (INLAY_SPACES.has(i + 1) ? 1 : 0));
  const scores: IndexVerdict['scores'] = [];
  for (let shift = -maxShift; shift <= maxShift; shift++) {
    const Hs = shiftFrets(H, model, shift);
    const dev = spaceDeviation(image, Hs, model, maxFret);
    const valid = dev.map((d) => !Number.isNaN(d));
    const d = dev.filter((_, i) => valid[i]);
    const t = template.filter((_, i) => valid[i]);
    const inlay = d.length >= 8 ? pearson(d, t) : 0;
    scores.push({
      shift,
      inlay,
      nut: nutScore(image, Hs, model) + 0.5 * nutContrast(image, Hs, model),
      total: 0,
    });
  }
  // The inlay cue counts only when some shift shows the pattern; plain boards rely on the nut.
  const inlaysSeen = scores.some((x) => x.inlay > 0.5);
  for (const x of scores) x.total = (inlaysSeen ? 2 * x.inlay : 0) + x.nut;
  // On a tie, keep the fit's own index (smallest shift).
  const sorted = [...scores].sort(
    (a, b) => b.total - a.total || Math.abs(a.shift) - Math.abs(b.shift),
  );
  return {
    shift: sorted[0]!.shift,
    margin: sorted[0]!.total - sorted[1]!.total,
    scores,
    inlaysSeen,
  };
}
