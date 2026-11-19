import { describe, expect, it } from 'vitest';
import { cagedChordShape } from '@core/theory/chords/index';
import { scaleShape } from '@core/theory/scales/index';
import { TUNINGS } from '@core/theory/tuning';
import { cardNotes } from './cardSound';

const tuning = TUNINGS.standard;

describe('card sound', () => {
  it('chords strum one note per string, low string first', () => {
    const shape = cagedChordShape(0, 'maj', { tuning, maxFret: 15 });
    const notes = cardNotes(shape, ['C'], null);
    const strings = notes.map((n) => n.string);
    expect(strings).toEqual([...strings].sort((a, b) => b - a));
    expect(new Set(strings).size).toBe(strings.length);
    expect(notes[1]!.offset).toBeCloseTo(0.035, 6);
  });

  it('scales go up each pitch once, spread over the card time within 2–8 notes a second', () => {
    const shape = scaleShape(9, 'minor-pentatonic', 'caged', { tuning, maxFret: 15 });
    const group = shape.groups[0]!.id;
    const notes = cardNotes(shape, [group], 8000);
    const midis = notes.map((n) => n.midi);
    expect(midis).toEqual([...new Set(midis)].sort((a, b) => a - b));
    const step = notes[1]!.offset - notes[0]!.offset;
    expect(step).toBeGreaterThanOrEqual(0.125);
    expect(step).toBeLessThanOrEqual(0.5);
    expect(notes[notes.length - 1]!.offset).toBeLessThan(8);
  });

  it('nothing to play for an empty selection', () => {
    const shape = scaleShape(9, 'minor-pentatonic', 'caged', { tuning, maxFret: 15 });
    expect(cardNotes(shape, ['no-such-group'], 4000)).toEqual([]);
  });
});
