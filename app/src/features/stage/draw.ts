/**
 * Canvas drawing for the Stage (docs/specs/05-ux.md §4). Geometry arrives in video pixels; `View`
 * maps it onto the canvas, mirroring positions (not text) when the video is shown as a mirror.
 */
import { fretX, halfWidth, stringY, type InstrumentModel } from '@core/guitar/instrument';
import type { OverlayItem } from '@overlay/projection';
import { apply, type Mat3, type Pt } from '@vision/geometry';

export interface View {
  /** Canvas px per video px. */
  scale: number;
  mirror: boolean;
  videoWidth: number;
}

export function toCanvas(view: View, p: Pt): Pt {
  return { x: (view.mirror ? view.videoWidth - p.x : p.x) * view.scale, y: p.y * view.scale };
}

/** Video px of a canvas point (inverse of toCanvas). */
export function toVideo(view: View, p: Pt): Pt {
  const x = p.x / view.scale;
  return { x: view.mirror ? view.videoWidth - x : x, y: p.y / view.scale };
}

const cssColorCache = new Map<string, string>();
/** "var(--shape-c)" → the colour it currently resolves to. */
export function resolveColor(value: string): string {
  const m = /^var\((--[\w-]+)\)$/.exec(value);
  if (!m) return value;
  let c = cssColorCache.get(m[1]!);
  if (!c) {
    c = getComputedStyle(document.documentElement).getPropertyValue(m[1]!).trim() || '#ffffff';
    cssColorCache.set(m[1]!, c);
  }
  return c;
}

export function clearColorCache(): void {
  cssColorCache.clear();
}

/**
 * Dots never shrink below this mean radius on screen (CSS px) at dot size 100 %, so a small neck stays
 * readable. The floor follows the dot size setting (field test 2026-11-19: with the neck small in the
 * picture every dot sat on a fixed floor and the setting changed nothing).
 */
export const MIN_DOT_RADIUS = 7;

/** On-screen semi-axes, enlarged together (keeping the board's foreshortening) when tiny. */
export function screenAxes(
  view: View,
  item: Pick<OverlayItem, 'rx' | 'ry'>,
  minRadius = MIN_DOT_RADIUS,
): [number, number] {
  const rx = item.rx * view.scale;
  const ry = item.ry * view.scale;
  const mean = Math.sqrt(Math.max(1e-6, rx * ry));
  const k = mean < minRadius ? minRadius / mean : 1;
  return [Math.max(0.5, rx * k), Math.max(0.5, ry * k)];
}

function ellipsePath(
  ctx: CanvasRenderingContext2D,
  view: View,
  item: OverlayItem,
  minRadius: number,
): void {
  const c = toCanvas(view, { x: item.cx, y: item.cy });
  const angle = view.mirror ? Math.PI - item.angle : item.angle;
  const [rx, ry] = screenAxes(view, item, minRadius);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx, ry, angle, 0, 2 * Math.PI);
}

/** Dots smaller than this radius (px) show no letter: it would not fit. Default-size dots (7 px) do. */
const MIN_LABEL_DOT_PX = 6;

/**
 * Dots, open-string rings and mute crosses; `fade` multiplies every opacity (0..1); `dotScale` is the
 * player's dot size setting (it also scales the smallest size a dot is drawn at).
 */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  view: View,
  items: OverlayItem[],
  fade: number,
  dotScale = 1,
  pulse?: ReadonlySet<string>,
): void {
  const minRadius = MIN_DOT_RADIUS * dotScale;
  for (const item of items) {
    const c = toCanvas(view, { x: item.cx, y: item.cy });
    if (item.kind === 'muted') {
      const r = screenAxes(view, item, minRadius)[0];
      ctx.globalAlpha = 0.9 * fade;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, r * 0.35);
      ctx.beginPath();
      ctx.moveTo(c.x - r, c.y - r);
      ctx.lineTo(c.x + r, c.y + r);
      ctx.moveTo(c.x + r, c.y - r);
      ctx.lineTo(c.x - r, c.y + r);
      ctx.stroke();
      continue;
    }
    ctx.globalAlpha = item.opacity * fade;
    const [rx, ry] = screenAxes(view, item, minRadius);
    const [first, second] = item.colors.map(resolveColor);
    ellipsePath(ctx, view, item, minRadius);
    if (item.kind === 'open') {
      ctx.lineWidth = Math.max(2, ry * 0.35);
      ctx.strokeStyle = first!;
      ctx.stroke();
    } else {
      ctx.fillStyle = first!;
      ctx.fill();
      if (second) {
        // Split dot: the second colour fills one half.
        ctx.save();
        ellipsePath(ctx, view, item, minRadius);
        ctx.clip();
        ctx.fillStyle = second;
        ctx.fillRect(c.x, c.y - rx, rx, 2 * rx);
        ctx.restore();
      }
    }
    if (pulse?.has(`${item.string}-${item.fret}`)) {
      // The note is sounding (practice runs, tab play-along): a bright ring outside the dot.
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(
        c.x,
        c.y,
        rx + 5,
        ry + 5,
        view.mirror ? Math.PI - item.angle : item.angle,
        0,
        2 * Math.PI,
      );
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();
    }
    if (item.root) {
      ellipsePath(ctx, view, item, minRadius);
      ctx.lineWidth = Math.max(1.5, ry * 0.22);
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
    // The letter follows the dot; on a dot too small to hold a readable letter it is left out.
    if (item.label && item.kind === 'dot' && ry >= MIN_LABEL_DOT_PX) {
      const size = ry * 1.25;
      ctx.font = `600 ${size.toFixed(1)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0b0d10';
      ctx.fillText(item.label, c.x, c.y + size * 0.05);
    }
  }
  ctx.globalAlpha = 1;
}

/** Fret lines, outer strings and fret numbers 1·3·5·7·9·12 (lock preview and confirmation). */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  view: View,
  H: Mat3,
  model: InstrumentModel,
  options: { numbers: boolean; color: string; lastFret?: number },
): void {
  const last = Math.min(options.lastFret ?? 15, model.fretCount);
  const line = (a: Pt, b: Pt) => {
    const p = toCanvas(view, apply(H, a.x, a.y));
    const q = toCanvas(view, apply(H, b.x, b.y));
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
  };
  ctx.strokeStyle = options.color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  for (let n = 0; n <= last; n++) {
    const x = fretX(model, n);
    const hw = halfWidth(model, x);
    line({ x, y: -hw }, { x, y: hw });
  }
  const end = fretX(model, last);
  for (const s of [1, model.strings])
    line({ x: 0, y: stringY(model, s, 0) }, { x: end, y: stringY(model, s, end) });
  ctx.stroke();
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let s = 2; s < model.strings; s++)
    line({ x: 0, y: stringY(model, s, 0) }, { x: end, y: stringY(model, s, end) });
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (!options.numbers) return;
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const n of [1, 3, 5, 7, 9, 12]) {
    if (n > last) continue;
    const x = (fretX(model, n - 1) + fretX(model, n)) / 2;
    const p = toCanvas(view, apply(H, x, -halfWidth(model, x) - 7));
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(n), p.x, p.y + 1);
  }
}
