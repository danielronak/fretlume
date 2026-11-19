/**
 * Playground (phase 5 task 5.3): up to three library items stacked on one neck, each in its own
 * colour, full or faint; quick root and position steppers; a chord progression to step through.
 * Pure: layers are merged into one Shape that the flat diagram and the camera overlay both draw.
 */
import { libraryItem } from '@core/theory/library/index';
import { itemId } from '@features/library/model';
import { mod } from '@core/theory/pitch';
import type { Mark, Shape } from '@core/theory/types';
import type { ParsedChord } from '@core/theory/chords/parse';

export const MAX_LAYERS = 3;
/** Layer colours (indexes into overlay/display.ts LAYER_COLORS). */
export const LAYER_COLOR_COUNT = 6;

export interface PlaygroundLayer {
  itemId: string;
  /** Deck entry: 0 = all shapes, then one per shape, position or voicing. */
  entry: number;
  color: number;
  faint: boolean;
  visible: boolean;
}

export interface PlaygroundState {
  layers: PlaygroundLayer[];
  /** Progression as typed ("C G Am F"). */
  progression: string;
  /** Current chord of the progression (it replaces the first layer's item). */
  chordIndex: number;
}

export const EMPTY_PLAYGROUND: PlaygroundState = { layers: [], progression: '', chordIndex: 0 };

/** Group id that carries a layer's colour (overlay/display.ts groupColor). */
export const layerGroup = (color: number): string => `layer-${mod(color, LAYER_COLOR_COUNT)}`;

export function addLayer(s: PlaygroundState, id: string): PlaygroundState {
  if (s.layers.length >= MAX_LAYERS || !libraryItem(id)) return s;
  const used = new Set(s.layers.map((l) => l.color));
  const color = [...Array(LAYER_COLOR_COUNT).keys()].find((c) => !used.has(c)) ?? 0;
  return {
    ...s,
    layers: [...s.layers, { itemId: id, entry: 0, color, faint: false, visible: true }],
  };
}

export function updateLayer(
  s: PlaygroundState,
  index: number,
  patch: Partial<PlaygroundLayer>,
): PlaygroundState {
  return { ...s, layers: s.layers.map((l, i) => (i === index ? { ...l, ...patch } : l)) };
}

export function removeLayer(s: PlaygroundState, index: number): PlaygroundState {
  return { ...s, layers: s.layers.filter((_, i) => i !== index) };
}

/** The same item with its root moved by `semitones`. */
export function transposeItem(id: string, semitones: number): string {
  const item = libraryItem(id);
  if (!item) return id;
  return itemId(item.kind, mod(item.root + semitones, 12), item.typeId);
}

/** Every layer moved by `semitones` (keeps the shape each layer shows). */
export function transposeAll(s: PlaygroundState, semitones: number): PlaygroundState {
  return {
    ...s,
    layers: s.layers.map((l) => ({ ...l, itemId: transposeItem(l.itemId, semitones) })),
  };
}

/** Next or previous shape of a layer, wrapping over its `count` deck entries. */
export function stepEntry(
  s: PlaygroundState,
  index: number,
  delta: number,
  count: number,
): PlaygroundState {
  const layer = s.layers[index];
  if (!layer || count < 1) return s;
  return updateLayer(s, index, { entry: mod(layer.entry + delta, count) });
}

/** Go to chord `i` of the progression: the first layer shows it (a chord layer is added if none). */
export function goToChord(s: PlaygroundState, chords: ParsedChord[], i: number): PlaygroundState {
  if (chords.length === 0) return s;
  const chordIndex = mod(i, chords.length);
  const chord = chords[chordIndex]!;
  const id = itemId('chord', chord.root, chord.qualityId);
  if (s.layers.length === 0) return { ...addLayer(s, id), chordIndex };
  return { ...updateLayer(s, 0, { itemId: id }), chordIndex };
}

export interface LayerShape {
  layer: PlaygroundLayer;
  shape: Shape;
  /** Groups of the entry the layer shows (empty = all). */
  activeGroups: readonly string[];
}

/**
 * One Shape for all visible layers: each layer's marks (only those of the shape it shows) get the
 * layer's colour group; a note two layers share becomes one split dot; faint layers are ghosts.
 */
export function mergeLayers(parts: LayerShape[], title: string): Shape {
  const byPos = new Map<string, Mark>();
  const muted = new Set<number>();
  for (const { layer, shape, activeGroups } of parts) {
    if (!layer.visible) continue;
    const group = layerGroup(layer.color);
    for (const m of shape.marks) {
      if (m.role === 'ghost') continue;
      if (activeGroups.length && !m.groups.some((g) => activeGroups.includes(g))) continue;
      const key = `${m.string}-${m.fret}`;
      const prev = byPos.get(key);
      if (prev) {
        if (!prev.groups.includes(group)) prev.groups = [...prev.groups, group];
        if (prev.role === 'ghost' && !layer.faint) prev.role = m.role;
        continue;
      }
      byPos.set(key, { ...m, groups: [group], role: layer.faint ? 'ghost' : m.role });
    }
    for (const s of shape.muted) muted.add(s);
  }
  const marks = [...byPos.values()];
  const fretted = marks.filter((m) => m.fret > 0).map((m) => m.fret);
  return {
    id: 'playground',
    kind: 'notes',
    title,
    marks,
    // A string is muted only if no layer plays a note on it.
    muted: [...muted].filter((s) => !marks.some((m) => m.string === s)),
    window: fretted.length ? [Math.min(...fretted), Math.max(...fretted)] : [0, 0],
    groups: parts
      .filter((p) => p.layer.visible)
      .map((p) => ({ id: layerGroup(p.layer.color), label: p.shape.title })),
  };
}

/** Playground state as stored (localStorage) made safe; unknown items dropped. */
export function sanitizePlayground(value: unknown): PlaygroundState {
  if (!value || typeof value !== 'object') return EMPTY_PLAYGROUND;
  const v = value as Record<string, unknown>;
  const layers = (Array.isArray(v.layers) ? v.layers : [])
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .filter((l) => typeof l.itemId === 'string' && libraryItem(l.itemId) !== undefined)
    .slice(0, MAX_LAYERS)
    .map((l) => ({
      itemId: l.itemId as string,
      entry: Number.isInteger(l.entry) && (l.entry as number) >= 0 ? (l.entry as number) : 0,
      color: Number.isInteger(l.color) ? mod(l.color as number, LAYER_COLOR_COUNT) : 0,
      faint: l.faint === true,
      visible: l.visible !== false,
    }));
  return {
    layers,
    progression: typeof v.progression === 'string' ? v.progression.slice(0, 200) : '',
    chordIndex: Number.isInteger(v.chordIndex) ? Math.max(0, v.chordIndex as number) : 0,
  };
}
