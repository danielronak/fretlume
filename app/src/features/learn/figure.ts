/** Resolve a lesson figure (library item + voicing or deck entry) to what the neck shows. */
import { chordVoicings, voicingToShape } from '@core/theory/chords/index';
import { libraryItem } from '@core/theory/library/index';
import type { Tuning } from '@core/theory/types';
import type { FigureRef } from '@content/lessons/types';
import { rootSlug } from '@features/library/model';
import { buildDeck, type DeckEntry } from '@features/stage/deck';

export interface ResolvedFigure extends DeckEntry {
  title: string;
  /** Stage route for this item. */
  stagePath: string;
}

export function resolveFigure(
  ref: FigureRef,
  tuning: Tuning,
  frets: number,
): ResolvedFigure | null {
  const item = libraryItem(ref.itemId);
  if (!item) return null;
  const stagePath = `/stage/${item.kind}/${rootSlug(item.root)}/${item.typeId}`;
  if (ref.voicing !== undefined && item.kind === 'chord') {
    const voicing = chordVoicings(item.root, item.typeId, { tuning })[ref.voicing];
    if (!voicing) return null;
    return {
      title: item.title,
      label: item.title,
      shape: voicingToShape(item.root, item.typeId, voicing, tuning),
      activeGroups: [],
      stagePath,
    };
  }
  const deck = buildDeck(item.kind, item.root, item.typeId, tuning, frets);
  const entry = deck.entries[Math.min(ref.entry ?? 0, deck.entries.length - 1)];
  return entry ? { ...entry, title: item.title, stagePath } : null;
}
