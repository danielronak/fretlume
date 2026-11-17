/**
 * The Stage deck (phase 3 task 3.9): the shapes of one library item, in the order the player steps
 * through them on the guitar. Pure.
 */
import {
  cagedChordShape,
  chordVoicings,
  formatFrets,
  hasStandardIntervals,
  voicingToShape,
} from '@core/theory/chords/index';
import { arpeggioShape } from '@core/theory/extras';
import { scaleShape } from '@core/theory/scales/index';
import { STRING_SETS, triadShape, type TriadQuality } from '@core/theory/triads';
import type { PitchClass, Shape, Tuning } from '@core/theory/types';
import { t } from '@i18n/index';
import type { LibraryKind } from '@core/theory/library/catalogue';
import { groupBase, hasCagedChordShapes, itemDetails } from '@features/library/model';

export interface DeckEntry {
  /** Short label for the deck, e.g. "Voicing 2 · x32010" or "E shape". */
  label: string;
  shape: Shape;
  /** Groups to highlight; empty = all. */
  activeGroups: string[];
}

export interface Deck {
  title: string;
  entries: DeckEntry[];
}

/** "All shapes" first, then one entry per group (octave repeats such as "E+12" go with their base). */
function byGroup(shape: Shape, allLabel: string): DeckEntry[] {
  const bases: string[] = [];
  for (const g of shape.groups) {
    const base = groupBase(g.id);
    if (!bases.includes(base)) bases.push(base);
  }
  const entries: DeckEntry[] = [{ label: allLabel, shape, activeGroups: [] }];
  if (bases.length < 2) return entries;
  for (const base of bases) {
    const ids = shape.groups.map((g) => g.id).filter((id) => groupBase(id) === base);
    const label = shape.groups.find((g) => g.id === base)?.label ?? base;
    entries.push({ label, shape, activeGroups: ids });
  }
  return entries;
}

export function buildDeck(
  kind: LibraryKind,
  root: PitchClass,
  typeId: string,
  tuning: Tuning,
  frets: number,
): Deck {
  const title = itemDetails(kind, root, typeId).title;
  const options = { tuning, maxFret: frets };
  switch (kind) {
    case 'chord': {
      const entries: DeckEntry[] = [];
      if (hasCagedChordShapes(typeId)) {
        const caged = cagedChordShape(root, typeId, options);
        if (caged.groups.length >= 2) entries.push(...byGroup(caged, t('stageAllShapes')));
      }
      chordVoicings(root, typeId, { ...options, limit: 8 }).forEach((v, i) =>
        entries.push({
          label: t('stageVoicing', { n: i + 1, frets: formatFrets(v.frets) }),
          shape: voicingToShape(root, typeId, v, tuning),
          activeGroups: [],
        }),
      );
      return { title, entries };
    }
    case 'scale':
      return {
        title,
        entries: byGroup(
          scaleShape(root, typeId, hasStandardIntervals(tuning) ? 'caged' : 'neck', options),
          t('stageAllPositions'),
        ),
      };
    case 'key': {
      const mode = typeId === 'minor' ? 'minor' : 'major';
      return {
        title,
        entries: byGroup(
          scaleShape(root, mode, hasStandardIntervals(tuning) ? 'caged' : 'neck', options),
          t('stageAllPositions'),
        ),
      };
    }
    case 'triad':
      return {
        title,
        entries: [...STRING_SETS].reverse().map((set) => ({
          label: t('stageStringSet', { set: set.split('').join('-') }),
          shape: triadShape(root, typeId as TriadQuality, set, options),
          activeGroups: [],
        })),
      };
    case 'arpeggio':
      return { title, entries: byGroup(arpeggioShape(root, typeId, options), t('stageAllShapes')) };
    default:
      return { title, entries: [] };
  }
}
