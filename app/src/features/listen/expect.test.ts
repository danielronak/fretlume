import { describe, expect, it } from 'vitest';
import { chordVoicings, voicingToShape } from '@core/theory/chords/index';
import { scaleShape } from '@core/theory/scales/index';
import { expectationFromShape } from './expect';

const STD = [64, 59, 55, 50, 45, 40];

describe('expectationFromShape', () => {
  it('a chord voicing becomes a chord with its muted strings', () => {
    const shape = voicingToShape(0, 'maj', chordVoicings(0, 'maj')[0]!);
    const e = expectationFromShape(shape, [], STD, 'c', 440)!;
    expect(e.kind).toBe('chord');
    expect(e.notes.map((n) => n.string)).toEqual([5, 4, 3, 2, 1]);
    expect(e.muted).toEqual([{ string: 6, midi: 40 }]);
  });

  it('a whole scale cannot be judged as one attempt', () => {
    expect(
      expectationFromShape(scaleShape(9, 'minor-pentatonic', 'caged'), [], STD, 's', 440),
    ).toBeNull();
  });
});
