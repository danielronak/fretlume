/** Scales: definitions and shapes. */
import { degreePc, spellDegree } from '../degrees';
import { noteName, tonicSpelling } from '../pitch';
import { makeShape, mergeMarks } from '../shape';
import type { PitchClass, Shape } from '../types';
import {
  cagedPositions,
  cagedShape,
  fullNeckMarks,
  threeNpsPositions,
  type PositionOptions,
  type ToneSet,
} from './positions';
import { scaleDef, type ScaleDef } from './table';

export * from './table';
export * from './positions';

export function scaleTones(root: PitchClass, scale: ScaleDef): ToneSet {
  return { root, degrees: scale.degrees, third: scale.third };
}

export function scaleName(root: PitchClass, scale: ScaleDef): string {
  return `${noteName(tonicSpelling(root, scale.third))} ${scale.name}`;
}

/** Note names of the scale in order, spelled for its key: A major → A B C# D E F# G#. */
export function scaleNoteNames(root: PitchClass, scale: ScaleDef): string[] {
  const tonic = tonicSpelling(root, scale.third);
  return scale.degrees.map((degree) => spellDegree(tonic, degree));
}

export function scalePcs(root: PitchClass, scale: ScaleDef): PitchClass[] {
  return scale.degrees.map((degree) => degreePc(root, degree));
}

export type ScaleLayout = 'caged' | 'nps' | 'neck';

/** A scale on the neck in the chosen layout, as one shape with a group per position. */
export function scaleShape(
  root: PitchClass,
  scaleId: string,
  layout: ScaleLayout = 'caged',
  options: PositionOptions = {},
): Shape {
  const scale = scaleDef(scaleId);
  const tones = scaleTones(root, scale);
  const meta = {
    id: `scale:${root}:${scaleId}:${layout}`,
    kind: 'scale' as const,
    title: scaleName(root, scale),
  };
  if (layout === 'caged') return cagedShape(tones, meta, options);
  if (layout === 'nps') {
    const positions = threeNpsPositions(tones, options);
    if (positions.length > 0) {
      return makeShape({
        ...meta,
        root,
        marks: mergeMarks(positions.flatMap((p) => p.marks)),
        groups: positions.map((p) => ({ id: p.id, label: `Position ${p.index}` })),
      });
    }
  }
  return makeShape({ ...meta, root, marks: fullNeckMarks(tones, options) });
}

/** One CAGED position on its own (for "one shape at a time" practice). */
export function scalePositionShape(
  root: PitchClass,
  scaleId: string,
  positionId: string,
  options: PositionOptions = {},
): Shape | null {
  const scale = scaleDef(scaleId);
  const position = cagedPositions(scaleTones(root, scale), options).find(
    (p) => p.id === positionId,
  );
  if (!position) return null;
  return makeShape({
    id: `scale:${root}:${scaleId}:${positionId}`,
    kind: 'scale',
    title: `${scaleName(root, scale)}, ${position.form} shape`,
    root,
    marks: position.marks,
    groups: [{ id: position.id, label: `${position.form} shape` }],
  });
}
