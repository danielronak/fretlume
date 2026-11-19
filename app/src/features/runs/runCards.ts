/** Helpers shared by the run screens and the Stage: card titles and deck entries. */
import { libraryItem, type LibraryItem } from '@core/theory/library/index';
import type { Tuning } from '@core/theory/types';
import { t } from '@i18n/index';
import type { RunCard } from '@learn/run';
import { buildDeck, type DeckEntry } from '@features/stage/deck';

export interface ResolvedCard {
  card: RunCard;
  item: LibraryItem;
  /** The deck entry the card shows (clamped to the item's deck). */
  entry: DeckEntry;
  /** Labels of all entries of the item's deck (for the shape picker). */
  entryLabels: string[];
}

export function resolveCard(card: RunCard, tuning: Tuning, frets: number): ResolvedCard | null {
  const item = libraryItem(card.itemId);
  if (!item) return null;
  const deck = buildDeck(item.kind, item.root, item.typeId, tuning, frets);
  if (deck.entries.length === 0) return null;
  const entry = deck.entries[Math.min(card.entry, deck.entries.length - 1)]!;
  return { card, item, entry, entryLabels: deck.entries.map((e) => e.label) };
}

/** "C major · E shape" (just the title when the card shows all shapes). */
export function cardTitle(resolved: ResolvedCard): string {
  return resolved.card.entry === 0
    ? resolved.item.title
    : `${resolved.item.title} · ${resolved.entry.label}`;
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? t('runsMinutes', { m, s }) : t('runsSeconds', { s });
}
