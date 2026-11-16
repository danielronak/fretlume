import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  boardPoint,
  cellAt,
  fretAtX,
  fretX,
  halfWidth,
  INSTRUMENTS,
  stringSpread,
  stringY,
  type InstrumentModel,
} from './instrument';

const models: InstrumentModel[] = Object.values(INSTRUMENTS);
const electric = INSTRUMENTS.electric;

describe('instrument geometry', () => {
  it('places the 12th fret at half the scale and the nut at zero', () => {
    for (const m of models) {
      expect(fretX(m, 0)).toBe(0);
      expect(fretX(m, 12)).toBeCloseTo(m.scaleMm / 2, 9);
      expect(fretX(m, 24)).toBeCloseTo(m.scaleMm * 0.75, 9);
    }
  });

  it('matches hand-computed fret positions for a 648 mm scale', () => {
    expect(fretX(electric, 1)).toBeCloseTo(36.37, 2);
    expect(fretX(electric, 5)).toBeCloseTo(162.55, 2);
    expect(fretX(electric, 7)).toBeCloseTo(215.51, 2);
  });

  it('each fret space is 2^(-1/12) of the one before', () => {
    const ratio = 2 ** (-1 / 12);
    for (let n = 1; n < 21; n++) {
      const a = fretX(electric, n) - fretX(electric, n - 1);
      const b = fretX(electric, n + 1) - fretX(electric, n);
      expect(b / a).toBeCloseTo(ratio, 9);
    }
  });

  it('fretAtX inverts fretX', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 24, noNaN: true }), (n) => {
        expect(fretAtX(electric, fretX(electric, n))).toBeCloseTo(n, 8);
      }),
    );
  });

  it('tapers from nut width to 12th-fret width', () => {
    for (const m of models) {
      expect(halfWidth(m, 0) * 2).toBeCloseTo(m.nutWidthMm, 9);
      expect(halfWidth(m, fretX(m, 12)) * 2).toBeCloseTo(m.width12Mm, 9);
    }
  });

  it('puts string 1 on the treble side (+y) and string 6 opposite, symmetric about the centre', () => {
    for (const m of models) {
      expect(stringY(m, 1, 0)).toBeCloseTo(m.stringSpreadNutMm / 2, 9);
      expect(stringY(m, m.strings, 0)).toBeCloseTo(-m.stringSpreadNutMm / 2, 9);
      expect(stringY(m, 1, 100) + stringY(m, m.strings, 100)).toBeCloseTo(0, 9);
      expect(stringSpread(m, m.scaleMm)).toBeCloseTo(m.stringSpreadBridgeMm, 9);
    }
  });

  it('keeps every string inside the fretboard edges on every fret', () => {
    for (const m of models) {
      for (let fret = 0; fret <= m.frets; fret++) {
        const x = fretX(m, fret);
        expect(Math.abs(stringY(m, 1, x))).toBeLessThan(halfWidth(m, x) - 1.5);
      }
    }
  });

  it('puts fretted notes behind their fret wire and open markers behind the nut', () => {
    const p = boardPoint(electric, 3, 5);
    expect(p.xMm).toBeGreaterThan(fretX(electric, 4));
    expect(p.xMm).toBeLessThan(fretX(electric, 5));
    expect(boardPoint(electric, 1, 0).xMm).toBeLessThan(0);
    expect(() => boardPoint(electric, 7, 1)).toThrow();
    expect(() => boardPoint(electric, 1, 23)).toThrow();
  });

  it('cellAt recovers the string and fret of every board point', () => {
    for (const m of models) {
      for (let s = 1; s <= m.strings; s++) {
        for (let fret = 0; fret <= m.frets; fret++) {
          const { xMm, yMm } = boardPoint(m, s, fret);
          expect(cellAt(m, xMm, yMm)).toEqual({ string: s, fret });
        }
      }
    }
  });
});
