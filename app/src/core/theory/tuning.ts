/** Tunings, capo and the mapping between positions on the neck and pitches. */
import { mod, pcOf } from './pitch';
import type { Midi, PitchClass, Position, Tuning } from './types';

const tuning = (id: string, name: string, lowToHigh: Midi[]): Tuning => ({
  id,
  name,
  strings: [...lowToHigh].reverse(),
});

/** Presets, written low string → high string as guitarists say them. */
export const TUNINGS = {
  standard: tuning('standard', 'Standard (E A D G B E)', [40, 45, 50, 55, 59, 64]),
  dropD: tuning('drop-d', 'Drop D (D A D G B E)', [38, 45, 50, 55, 59, 64]),
  halfStepDown: tuning('half-step-down', 'Half step down (Eb Ab Db Gb Bb Eb)', [
    39, 44, 49, 54, 58, 63,
  ]),
  dadgad: tuning('dadgad', 'DADGAD', [38, 45, 50, 55, 57, 62]),
  openG: tuning('open-g', 'Open G (D G D G B D)', [38, 43, 50, 55, 59, 62]),
  openD: tuning('open-d', 'Open D (D A D F# A D)', [38, 45, 50, 54, 57, 62]),
} as const satisfies Record<string, Tuning>;

export const STANDARD_TUNING: Tuning = TUNINGS.standard;

export function customTuning(lowToHigh: Midi[], name = 'Custom'): Tuning {
  if (lowToHigh.length < 4) throw new Error('a tuning needs at least 4 strings');
  return tuning('custom', name, lowToHigh);
}

/**
 * A capo raises every open string. Shapes are computed against the capo'd tuning with frets
 * counted from the capo; `toAbsoluteFret` converts back to frets from the nut for drawing.
 */
export function withCapo(base: Tuning, capoFret: number): Tuning {
  if (capoFret === 0) return base;
  return {
    id: `${base.id}+capo${capoFret}`,
    name: `${base.name}, capo ${capoFret}`,
    strings: base.strings.map((midi) => midi + capoFret),
  };
}

export const toAbsoluteFret = (relativeFret: number, capoFret: number): number =>
  relativeFret + capoFret;

export function openMidi(t: Tuning, string: number): Midi {
  const midi = t.strings[string - 1];
  if (midi === undefined) throw new Error(`string ${string} does not exist in tuning ${t.id}`);
  return midi;
}

export function midiAt(t: Tuning, position: Position): Midi {
  return openMidi(t, position.string) + position.fret;
}

export function pcAt(t: Tuning, position: Position): PitchClass {
  return pcOf(midiAt(t, position));
}

/** Every position of a pitch class up to `maxFret`, ordered low string first, then by fret. */
export function positionsOfPc(t: Tuning, pc: PitchClass, maxFret: number): Position[] {
  const out: Position[] = [];
  for (let string = t.strings.length; string >= 1; string--) {
    const first = mod(pc - openMidi(t, string), 12);
    for (let fret = first; fret <= maxFret; fret += 12) out.push({ string, fret });
  }
  return out;
}

/** Lowest fret (0–11) at which `pc` appears on a string. */
export function lowestFretOfPc(t: Tuning, string: number, pc: PitchClass): number {
  return mod(pc - openMidi(t, string), 12);
}
