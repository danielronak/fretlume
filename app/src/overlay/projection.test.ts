import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { boardPoint, INSTRUMENTS } from '@core/guitar/instrument';
import { chordVoicings, voicingToShape } from '@core/theory/chords';
import { apply, fromControlPoints, type Mat3 } from '@vision/geometry';
import { APPROACH_MM, projectApproach, projectCircle, projectShape } from './projection';

const model = INSTRUMENTS.steelAcoustic;
const H: Mat3 = fromControlPoints(
  [
    { x: 1100, y: 240 },
    { x: 1112, y: 330 },
    { x: 560, y: 450 },
    { x: 548, y: 352 },
  ],
  model,
);
const options = {
  labelMode: 'notes',
  colorMode: 'group',
  dotScale: 1,
  flipStrings: false,
} as const;

describe('projectCircle', () => {
  it('is a circle of the right radius under a similarity', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        fc.double({ min: 0.5, max: 3, noNaN: true }),
        (angle, scale) => {
          const c = Math.cos(angle) * scale;
          const s = Math.sin(angle) * scale;
          const e = projectCircle([c, -s, 100, s, c, 50, 0, 0, 1], 10, 5, 4);
          expect(e.rx).toBeCloseTo(4 * scale, 6);
          expect(e.ry).toBeCloseTo(4 * scale, 6);
        },
      ),
    );
  });

  it('boundary points of the board circle land on the ellipse (first order)', () => {
    const e = projectCircle(H, 200, 5, 0.01);
    for (let k = 0; k < 8; k++) {
      const t = (k * Math.PI) / 4;
      const p = apply(H, 200 + 0.01 * Math.cos(t), 5 + 0.01 * Math.sin(t));
      // Into the ellipse frame.
      const dx = p.x - e.cx;
      const dy = p.y - e.cy;
      const u = dx * Math.cos(e.angle) + dy * Math.sin(e.angle);
      const v = -dx * Math.sin(e.angle) + dy * Math.cos(e.angle);
      expect((u / e.rx) ** 2 + (v / e.ry) ** 2).toBeCloseTo(1, 3);
    }
  });
});

describe('projectShape', () => {
  const shape = voicingToShape(0, 'maj', chordVoicings(0, 'maj')[0]!);

  it('puts each dot where the board point projects, open strings behind the nut', () => {
    const items = projectShape(shape, H, model, options);
    for (const mark of shape.marks) {
      const item = items.find((i) => i.kind !== 'muted' && i.string === mark.string)!;
      const b = boardPoint(model, mark.string, mark.fret);
      const p = apply(H, b.xMm, b.yMm);
      expect(item.cx).toBeCloseTo(p.x, 6);
      expect(item.kind).toBe(mark.fret === 0 ? 'open' : 'dot');
    }
    expect(items.filter((i) => i.kind === 'muted').length).toBe(shape.muted.length);
  });

  it('flips strings for left-handed stringing', () => {
    const plain = projectShape(shape, H, model, options);
    const flipped = projectShape(shape, H, model, { ...options, flipStrings: true });
    const mark = shape.marks.find((m) => m.fret > 0)!;
    const a = plain.find((i) => i.kind === 'dot' && i.string === mark.string)!;
    const b = flipped.find((i) => i.kind === 'dot' && i.string === mark.string)!;
    const mirror = boardPoint(model, 7 - mark.string, mark.fret);
    expect(b.cx).toBeCloseTo(apply(H, mirror.xMm, mirror.yMm).x, 6);
    expect(a.cy).not.toBeCloseTo(b.cy, 1);
  });

  it('draws ghosts under active marks and scales dots', () => {
    const big = projectShape(shape, H, model, { ...options, dotScale: 1.5 });
    const small = projectShape(shape, H, model, options);
    const d = (xs: typeof big) => xs.find((i) => i.kind === 'dot')!;
    expect(d(big).rx).toBeCloseTo(1.5 * d(small).rx, 6);
    const ghosts = projectShape(shape, H, model, { ...options, activeGroups: ['nothing'] });
    expect(ghosts.every((i) => i.kind === 'muted' || i.opacity === 0.35)).toBe(true);
  });
});

describe('projectApproach', () => {
  it('a ring lands on its note as lead reaches 0 and starts toward the bridge, larger', () => {
    const [near, far] = projectApproach(
      [
        { string: 3, fret: 5, lead: 1 },
        { string: 3, fret: 5, lead: 0 },
      ],
      H,
      model,
      { dotScale: 1, flipStrings: false },
    ).reverse() as [
      Extract<ReturnType<typeof projectApproach>[number], { kind: 'ring' }>,
      Extract<ReturnType<typeof projectApproach>[number], { kind: 'ring' }>,
    ];
    const spot = boardPoint(model, 3, 5);
    const at = apply(H, spot.xMm, spot.yMm);
    expect(near.cx).toBeCloseTo(at.x, 6);
    expect(near.cy).toBeCloseTo(at.y, 6);
    const start = apply(H, spot.xMm + APPROACH_MM, spot.yMm);
    expect(Math.hypot(far.cx - start.x, far.cy - start.y)).toBeLessThan(3);
    expect(far.rx).toBeGreaterThan(near.rx * 1.5);
    expect(near.opacity).toBe(1);
  });
});
