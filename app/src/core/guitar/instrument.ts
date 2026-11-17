/**
 * Parametric instrument geometry in millimetres (docs/specs/01-vision.md §1–§2).
 *
 * Board frame: origin at the centre of the nut's fretboard-side edge; +x toward the bridge along
 * the neck centre line; +y toward the treble side (string 1). The fretboard is the plane z = 0.
 */

export interface InstrumentModel {
  id: string;
  name: string;
  strings: number;
  /** Nut to bridge saddle. */
  scaleMm: number;
  /** Frets drawn and addressable on this profile. */
  frets: number;
  /** Frets physically on the neck (what the camera sees; the tracker models all of them). */
  fretCount: number;
  /** Fret where the neck meets the body. */
  bodyJointFret: number;
  nutWidthMm: number;
  /** Fretboard width at the 12th fret. */
  width12Mm: number;
  /** Distance between the centres of the two outer strings at the nut and at the bridge. */
  stringSpreadNutMm: number;
  stringSpreadBridgeMm: number;
  inlays: 'dots' | 'blocks' | 'none' | 'unknown';
}

export const INSTRUMENTS = {
  steelAcoustic: {
    id: 'steel-acoustic',
    name: 'Acoustic (steel strings)',
    strings: 6,
    scaleMm: 645,
    frets: 15,
    fretCount: 20,
    bodyJointFret: 14,
    nutWidthMm: 43,
    width12Mm: 54,
    stringSpreadNutMm: 36,
    stringSpreadBridgeMm: 55,
    inlays: 'dots',
  },
  electric: {
    id: 'electric',
    name: 'Electric',
    strings: 6,
    scaleMm: 648,
    frets: 22,
    fretCount: 22,
    bodyJointFret: 16,
    nutWidthMm: 42,
    width12Mm: 52,
    stringSpreadNutMm: 35,
    stringSpreadBridgeMm: 52,
    inlays: 'dots',
  },
  classical: {
    id: 'classical',
    name: 'Classical (nylon strings)',
    strings: 6,
    scaleMm: 650,
    frets: 15,
    fretCount: 19,
    bodyJointFret: 12,
    nutWidthMm: 52,
    width12Mm: 62,
    stringSpreadNutMm: 43,
    stringSpreadBridgeMm: 58,
    inlays: 'none',
  },
} as const satisfies Record<string, InstrumentModel>;

/** Distance from the nut to fret `n` (n may be fractional; fret 0 is the nut, fret 12 is half the scale). */
export function fretX(model: InstrumentModel, n: number): number {
  return model.scaleMm * (1 - 2 ** (-n / 12));
}

/** Fractional fret number at distance `xMm` from the nut (inverse of `fretX`). */
export function fretAtX(model: InstrumentModel, xMm: number): number {
  return -12 * Math.log2(1 - xMm / model.scaleMm);
}

/** Half the fretboard width at distance `xMm` from the nut (the board tapers linearly). */
export function halfWidth(model: InstrumentModel, xMm: number): number {
  const x12 = fretX(model, 12);
  return (model.nutWidthMm + ((model.width12Mm - model.nutWidthMm) * xMm) / x12) / 2;
}

/** Distance between the outer strings at `xMm` (strings fan out linearly from nut to bridge). */
export function stringSpread(model: InstrumentModel, xMm: number): number {
  return (
    model.stringSpreadNutMm +
    ((model.stringSpreadBridgeMm - model.stringSpreadNutMm) * xMm) / model.scaleMm
  );
}

/** y of string `s` (1 = highest, at +y) at distance `xMm` from the nut. */
export function stringY(model: InstrumentModel, s: number, xMm: number): number {
  return (stringSpread(model, xMm) * ((model.strings + 1) / 2 - s)) / (model.strings - 1);
}

/** How far behind the fret wire a fingertip sits, as a fraction of the fret space. */
export const FINGER_TARGET_FRACTION = 0.62;
/** Where open-string markers are drawn, behind the nut. */
export const OPEN_MARKER_X_MM = -9;

/**
 * Board point where a note is fretted (or, for fret 0, where its open-string marker goes).
 * Fretted notes sit just behind the wire: 62 % of the way from the previous fret.
 */
export function boardPoint(
  model: InstrumentModel,
  string: number,
  fret: number,
): { xMm: number; yMm: number } {
  if (string < 1 || string > model.strings) throw new Error(`string ${string} out of range`);
  if (fret < 0 || fret > model.frets) throw new Error(`fret ${fret} out of range`);
  const xMm =
    fret === 0
      ? OPEN_MARKER_X_MM
      : fretX(model, fret - 1) +
        FINGER_TARGET_FRACTION * (fretX(model, fret) - fretX(model, fret - 1));
  return { xMm, yMm: stringY(model, string, Math.max(xMm, 0)) };
}

/** Nearest string and fret space for a board point (used later to map fingertips to cells). */
export function cellAt(
  model: InstrumentModel,
  xMm: number,
  yMm: number,
): { string: number; fret: number } {
  const x = Math.max(xMm, 0);
  let string = 1;
  let best = Infinity;
  for (let s = 1; s <= model.strings; s++) {
    const d = Math.abs(stringY(model, s, x) - yMm);
    if (d < best) {
      best = d;
      string = s;
    }
  }
  const fret = xMm <= 0 ? 0 : Math.min(model.frets, Math.ceil(fretAtX(model, xMm) - 1e-9));
  return { string, fret };
}

/** Frets that carry position markers on most guitars; 12 and 24 are double. */
export const INLAY_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24] as const;
export const isDoubleInlay = (fret: number): boolean => fret % 12 === 0;
