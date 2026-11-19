/**
 * How marks are labelled and coloured (docs/specs/03-theory-content.md §7).
 * Shared by the flat diagram now and the camera overlay later, so both always agree.
 */
import type { Mark } from '@core/theory/types';

export type LabelMode = 'notes' | 'intervals' | 'fingers' | 'none';
export type ColorMode = 'group' | 'note' | 'degree' | 'finger' | 'single';

export function markLabel(mark: Mark, mode: LabelMode): string {
  switch (mode) {
    case 'notes':
      return mark.note;
    case 'intervals':
      return mark.degree ?? '';
    case 'fingers':
      return mark.finger !== undefined && mark.finger !== 0 ? String(mark.finger) : '';
    case 'none':
      return '';
  }
}

const SHAPE_VARS: Record<string, string> = {
  C: 'var(--shape-c)',
  A: 'var(--shape-a)',
  G: 'var(--shape-g)',
  E: 'var(--shape-e)',
  D: 'var(--shape-d)',
  root: 'var(--inv-root)',
  '1st': 'var(--inv-first)',
  '2nd': 'var(--inv-second)',
};

/** Playground layer colours (learn/playground.ts layerGroup). */
export const LAYER_COLORS = [
  'var(--shape-e)',
  'var(--shape-a)',
  'var(--shape-c)',
  'var(--shape-g)',
  'var(--shape-d)',
  'var(--dot-single)',
] as const;

/** Colour of a group id: CAGED letters (an octave repeat "E+12" keeps E's colour), inversions, positions. */
export function groupColor(groupId: string): string {
  const base = groupId.split('+')[0] ?? groupId;
  const known = SHAPE_VARS[base];
  if (known) return known;
  const layer = /^layer-(\d)$/.exec(base);
  if (layer) return LAYER_COLORS[Number(layer[1]) % LAYER_COLORS.length]!;
  const nps = /^nps(\d)$/.exec(base);
  if (nps) return `var(--note-${((Number(nps[1]) - 1) * 5) % 12})`;
  return 'var(--dot-single)';
}

function degreeColor(degree: string | undefined): string {
  if (!degree) return 'var(--deg-other)';
  const number = Number(degree.replace(/[b#]/g, ''));
  if (number === 1) return 'var(--deg-root)';
  if (number === 3) return 'var(--deg-third)';
  if (number === 5) return 'var(--deg-fifth)';
  if (number === 7) return 'var(--deg-seventh)';
  return 'var(--deg-other)';
}

/** One colour, or two for a note shared by two groups (drawn as a split dot). */
export function markColors(mark: Mark, mode: ColorMode): string[] {
  switch (mode) {
    case 'group':
      return mark.groups.length > 0
        ? mark.groups.slice(0, 2).map(groupColor)
        : [mark.role === 'root' ? 'var(--deg-root)' : 'var(--dot-single)'];
    case 'note':
      return [`var(--note-${mark.pc})`];
    case 'degree':
      return [degreeColor(mark.degree)];
    case 'finger':
      return [
        mark.finger !== undefined && mark.finger !== 0 && mark.finger !== 'T'
          ? `var(--finger-${mark.finger})`
          : 'var(--deg-other)',
      ];
    case 'single':
      return ['var(--dot-single)'];
  }
}

/** Is the mark part of the highlighted groups? With no highlight, everything is. */
export function isActive(mark: Mark, activeGroups: readonly string[] | undefined): boolean {
  if (!activeGroups || activeGroups.length === 0) return true;
  return mark.groups.some((group) => activeGroups.includes(group));
}
