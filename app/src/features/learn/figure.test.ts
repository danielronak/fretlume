import { describe, expect, it } from 'vitest';
import { LESSONS } from '@content/lessons/index';
import { TUNINGS } from '@core/theory/tuning';
import { resolveFigure } from './figure';

const T = TUNINGS.standard;

describe('lesson figures', () => {
  it('chord voicing 0 is the open shape the lesson text describes', () => {
    const em = resolveFigure({ itemId: 'chord-4-min', voicing: 0 }, T, 20)!;
    expect(em.shape.marks.filter((m) => m.fret > 0).map((m) => [m.string, m.fret])).toEqual([
      [5, 2],
      [4, 2],
    ]);
    expect(em.stagePath).toBe('/stage/chord/E/min');
    expect(resolveFigure({ itemId: 'chord-9-min', voicing: 0 }, T, 20)!.shape.muted).toEqual([6]);
  });

  it('the pentatonic box entry sits at the 5th fret with A on the 6th string', () => {
    const box = resolveFigure({ itemId: 'scale-9-minor-pentatonic', entry: 3 }, T, 20)!;
    const active = box.shape.marks.filter((m) =>
      m.groups.some((g) => box.activeGroups.includes(g)),
    );
    expect(active.some((m) => m.string === 6 && m.fret === 5 && m.role === 'root')).toBe(true);
    expect(Math.min(...active.filter((m) => m.fret < 12).map((m) => m.fret))).toBe(5);
  });

  it('every figure in the starter lessons resolves', () => {
    for (const lesson of LESSONS)
      for (const s of lesson.sections) {
        const refs = s.kind === 'explain' ? (s.figure ? [s.figure] : []) : s.steps;
        for (const ref of refs) expect(resolveFigure(ref, T, 20), ref.itemId).not.toBeNull();
      }
  });
});
