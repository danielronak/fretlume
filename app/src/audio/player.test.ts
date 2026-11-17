import { describe, expect, it } from 'vitest';
import { chordVoicings, voicingToShape } from '@core/theory/chords/index';
import { scaleShape } from '@core/theory/scales/index';
import { shapeNotes } from './player';

describe('shapeNotes', () => {
  it('strums a chord from the low string up, one note per string', () => {
    const c = voicingToShape(0, 'maj', chordVoicings(0, 'maj')[0]!); // x32010
    const notes = shapeNotes(c, 'strum');
    expect(notes.map((n) => n.midi)).toEqual([48, 52, 55, 60, 64]);
    expect(notes.map((n) => n.offset)).toEqual(
      [0, 0.035, 0.07, 0.105, 0.14].map((x) => expect.closeTo(x, 9)),
    );
  });

  it('plays each pitch of a position once, low to high', () => {
    const scale = scaleShape(9, 'minor-pentatonic', 'caged');
    const notes = shapeNotes(scale, 'arpeggio', ['E']); // box 1 at the fifth fret
    expect(notes.map((n) => n.midi)).toEqual([45, 48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72]);
    expect(new Set(notes.map((n) => n.offset)).size).toBe(notes.length);
  });
});
