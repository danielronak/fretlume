/**
 * Camera overlay geometry (docs/specs/05-ux.md §4): the marks of a Shape projected through the
 * board → image homography as ellipses lying flat on the board. Pure; the canvas only draws this.
 */
import {
  boardPoint,
  OPEN_MARKER_X_MM,
  stringSpread,
  stringY,
  type InstrumentModel,
} from '@core/guitar/instrument';
import type { Mark, Shape } from '@core/theory/types';
import { apply, jacobian, type Mat3 } from '@vision/geometry';
import { isActive, markColors, markLabel, type ColorMode, type LabelMode } from './display';

export interface OverlayOptions {
  labelMode: LabelMode;
  colorMode: ColorMode;
  activeGroups?: readonly string[];
  /** Dot size multiplier, 0.6–1.6. */
  dotScale: number;
  /** Left-handed stringing: string 1 sits where string 6 would. */
  flipStrings: boolean;
}

export interface Ellipse {
  cx: number;
  cy: number;
  /** Semi-axes (px) and rotation of the first axis (radians). */
  rx: number;
  ry: number;
  angle: number;
}

export type OverlayItem =
  | (Ellipse & {
      kind: 'dot' | 'open';
      colors: string[];
      label: string;
      root: boolean;
      /** 1 for active marks, 0.35 for ghosts (inactive groups). */
      opacity: number;
      string: number;
      fret: number;
    })
  | (Ellipse & { kind: 'muted'; string: number });

/** Ellipse that a board circle of radius rMm centred at (xMm, yMm) becomes in the image. */
export function projectCircle(H: Mat3, xMm: number, yMm: number, rMm: number): Ellipse {
  const c = apply(H, xMm, yMm);
  const [[a, b], [c2, d]] = jacobian(H, xMm, yMm);
  // Singular values of J give the axes; the left singular vector gives the angle.
  const e = (a + d) / 2;
  const f = (a - d) / 2;
  const g = (c2 + b) / 2;
  const h = (c2 - b) / 2;
  const q = Math.hypot(e, h);
  const r = Math.hypot(f, g);
  const a1 = Math.atan2(g, f);
  const a2 = Math.atan2(h, e);
  return {
    cx: c.x,
    cy: c.y,
    rx: (q + r) * rMm,
    ry: Math.abs(q - r) * rMm,
    angle: (a2 + a1) / 2,
  };
}

/** Local distance between neighbouring strings (mm). */
export function stringSpacingMm(model: InstrumentModel, xMm: number): number {
  return stringSpread(model, Math.max(0, xMm)) / (model.strings - 1);
}

export function projectShape(
  shape: Shape,
  H: Mat3,
  model: InstrumentModel,
  options: OverlayOptions,
): OverlayItem[] {
  const physical = (s: number) => (options.flipStrings ? model.strings + 1 - s : s);
  const items: OverlayItem[] = [];
  for (const s of shape.muted) {
    const string = physical(s);
    const y = stringY(model, string, 0);
    const r = 0.22 * stringSpacingMm(model, 0) * options.dotScale;
    items.push({ kind: 'muted', string: s, ...projectCircle(H, OPEN_MARKER_X_MM, y, r) });
  }
  const dots = (mark: Mark): OverlayItem | null => {
    if (mark.fret > model.frets) return null;
    const { xMm, yMm } = boardPoint(model, physical(mark.string), mark.fret);
    const r = 0.36 * stringSpacingMm(model, xMm) * options.dotScale;
    const active = isActive(mark, options.activeGroups);
    return {
      kind: mark.fret === 0 ? 'open' : 'dot',
      ...projectCircle(H, xMm, yMm, r),
      colors: markColors(mark, options.colorMode),
      label: markLabel(mark, options.labelMode),
      root: mark.role === 'root',
      opacity: active ? 1 : 0.35,
      string: mark.string,
      fret: mark.fret,
    };
  };
  const projected = shape.marks.map(dots).filter((x): x is OverlayItem => x !== null);
  // Ghosts underneath, active marks on top.
  projected.sort((a, b) => ('opacity' in a ? a.opacity : 1) - ('opacity' in b ? b.opacity : 1));
  return [...items, ...projected];
}
