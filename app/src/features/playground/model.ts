/** Playground helpers that need the deck builder: layer shapes, entry labels, the Stage deck. */
import { parseProgression } from '@core/theory/chords/parse';
import { libraryItem } from '@core/theory/library/index';
import type { Tuning } from '@core/theory/types';
import { t } from '@i18n/index';
import {
  goToChord,
  mergeLayers,
  sanitizePlayground,
  type LayerShape,
  type PlaygroundState,
} from '@learn/playground';
import { buildDeck, type Deck } from '@features/stage/deck';

const KEY = 'fretlume.playground';

export function loadPlayground(): PlaygroundState {
  try {
    return sanitizePlayground(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return sanitizePlayground(null);
  }
}

export function savePlayground(state: PlaygroundState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private mode or full storage: the playground still works, it is just not remembered.
  }
}

export interface ResolvedLayer extends LayerShape {
  title: string;
  entryLabels: string[];
}

export function resolveLayers(s: PlaygroundState, tuning: Tuning, frets: number): ResolvedLayer[] {
  return s.layers.flatMap((layer) => {
    const item = libraryItem(layer.itemId);
    if (!item) return [];
    const deck = buildDeck(item.kind, item.root, item.typeId, tuning, frets);
    const entry = deck.entries[Math.min(layer.entry, deck.entries.length - 1)];
    if (!entry) return [];
    return [
      {
        layer,
        shape: entry.shape,
        activeGroups: entry.activeGroups,
        title: item.title,
        entryLabels: deck.entries.map((e) => e.label),
      },
    ];
  });
}

export function playgroundTitle(layers: ResolvedLayer[]): string {
  return layers
    .filter((l) => l.layer.visible)
    .map((l) => l.title)
    .join(' + ');
}

/** For the Stage: one entry per chord of the progression (other layers kept), or one entry. */
export function playgroundDeck(s: PlaygroundState, tuning: Tuning, frets: number): Deck | null {
  const { chords } = parseProgression(s.progression);
  const states = chords.length ? chords.map((_, i) => goToChord(s, chords, i)) : [s];
  const entries = states
    .map((state) => {
      const layers = resolveLayers(state, tuning, frets);
      if (layers.length === 0) return null;
      const label = playgroundTitle(layers);
      return { label, shape: mergeLayers(layers, label), activeGroups: [] as string[] };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
  return entries.length ? { title: t('playgroundStageTitle'), entries } : null;
}
