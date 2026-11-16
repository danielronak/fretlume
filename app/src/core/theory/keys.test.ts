import { describe, expect, it } from 'vitest';
import {
  buildKey,
  capoSuggestions,
  chordScaleChoices,
  parallelKey,
  progressionChords,
  PROGRESSIONS,
  relativeKey,
  scalesForQuality,
  twelveBarBlues,
} from './keys';
import { CHORD_QUALITIES } from './chords/index';
import { parseNote, spelledPc } from './pitch';
import { SCALES } from './scales/index';

const pc = (name: string) => spelledPc(parseNote(name)!);

describe('keys', () => {
  it('C major has the seven diatonic chords with their roles', () => {
    const key = buildKey(pc('C'), 'major');
    expect(key.name).toBe('C major');
    expect(key.notes).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(key.triads.map((c) => `${c.numeral} ${c.symbol} ${c.role}`)).toEqual([
      'I C tonic',
      'ii Dm predominant',
      'iii Em tonic',
      'IV F predominant',
      'V G dominant',
      'vi Am tonic',
      'vii° Bdim dominant',
    ]);
    expect(key.sevenths.map((c) => `${c.numeral} ${c.symbol}`)).toEqual([
      'Imaj7 Cmaj7',
      'ii7 Dm7',
      'iii7 Em7',
      'IVmaj7 Fmaj7',
      'V7 G7',
      'vi7 Am7',
      'viiø7 Bm7b5',
    ]);
  });

  it('spells sharp and flat keys correctly', () => {
    expect(buildKey(pc('E'), 'major').triads.map((c) => c.symbol)).toEqual([
      'E',
      'F#m',
      'G#m',
      'A',
      'B',
      'C#m',
      'D#dim',
    ]);
    expect(buildKey(pc('Bb'), 'major').triads.map((c) => c.symbol)).toEqual([
      'Bb',
      'Cm',
      'Dm',
      'Eb',
      'F',
      'Gm',
      'Adim',
    ]);
    expect(buildKey(pc('A'), 'minor').triads.map((c) => `${c.numeral} ${c.symbol}`)).toEqual([
      'i Am',
      'ii° Bdim',
      'III C',
      'iv Dm',
      'v Em',
      'VI F',
      'VII G',
    ]);
  });

  it('harmonic minor raises the seventh: major V and diminished vii', () => {
    const key = buildKey(pc('A'), 'harmonic-minor');
    expect(key.notes).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G#']);
    expect(key.triads.map((c) => c.symbol)).toEqual([
      'Am',
      'Bdim',
      'Caug',
      'Dm',
      'E',
      'F',
      'G#dim',
    ]);
    expect(key.sevenths[4]!.symbol).toBe('E7');
    expect(key.sevenths[0]!.symbol).toBe('AmMaj7');
  });

  it('builds all 48 keys without gaps', () => {
    for (const mode of ['major', 'minor', 'harmonic-minor', 'melodic-minor'] as const) {
      for (let tonic = 0; tonic < 12; tonic++) {
        const key = buildKey(tonic, mode);
        expect(key.triads).toHaveLength(7);
        expect(key.sevenths).toHaveLength(7);
        expect(new Set(key.notes.map((n) => n[0])).size, key.name).toBe(7); // seven different letters
      }
    }
  });

  it('knows relative and parallel keys', () => {
    expect(relativeKey({ tonic: pc('C'), mode: 'major' })).toEqual({
      tonic: pc('A'),
      mode: 'minor',
    });
    expect(relativeKey({ tonic: pc('E'), mode: 'minor' })).toEqual({
      tonic: pc('G'),
      mode: 'major',
    });
    expect(parallelKey({ tonic: pc('C'), mode: 'major' })).toEqual({
      tonic: pc('C'),
      mode: 'minor',
    });
  });
});

describe('progressions', () => {
  it('turns numerals into chords', () => {
    const find = (id: string) => PROGRESSIONS.find((p) => p.id === id)!;
    const symbols = (id: string, tonic: string) =>
      progressionChords(pc(tonic), find(id)).map((c) => c.symbol);
    expect(symbols('I-V-vi-IV', 'G')).toEqual(['G', 'D', 'Em', 'C']);
    expect(symbols('ii-V-I', 'C')).toEqual(['Dm7', 'G7', 'Cmaj7']);
    expect(symbols('i-VII-VI-V', 'A')).toEqual(['Am', 'G', 'F', 'E']);
    expect(symbols('ii-V-i', 'A')).toEqual(['Bm7b5', 'E7', 'Am7']);
  });

  it('every progression resolves in every key', () => {
    for (const progression of PROGRESSIONS) {
      for (let tonic = 0; tonic < 12; tonic++) {
        expect(progressionChords(tonic, progression)).toHaveLength(progression.steps.length);
      }
    }
  });

  it('twelve-bar blues in A', () => {
    expect(twelveBarBlues(pc('A'))).toEqual([
      'A7',
      'A7',
      'A7',
      'A7',
      'D7',
      'D7',
      'A7',
      'A7',
      'E7',
      'D7',
      'A7',
      'E7',
    ]);
  });
});

describe('capo and chord-scale help', () => {
  it('suggests capo positions with open shapes', () => {
    expect(capoSuggestions(pc('B'), 'major')).toEqual([
      { capo: 2, shapesOf: 'A major' },
      { capo: 4, shapesOf: 'G major' },
      { capo: 7, shapesOf: 'E major' },
    ]);
    expect(capoSuggestions(pc('C'), 'major')[0]).toEqual({ capo: 0, shapesOf: 'C major' });
  });

  it('offers scales for each chord of a key', () => {
    const key = buildKey(pc('C'), 'major');
    expect(chordScaleChoices(key.triads[1]!, 'major')).toEqual(['dorian', 'minor-pentatonic']);
    expect(chordScaleChoices(key.triads[4]!, 'major')).toEqual(['mixolydian', 'major-pentatonic']);
    expect(chordScaleChoices(key.triads[6]!, 'major')).toEqual(['locrian']);
  });

  it('every suggested scale exists', () => {
    const ids = new Set(SCALES.map((s) => s.id));
    for (const quality of CHORD_QUALITIES) {
      for (const id of scalesForQuality(quality.id))
        expect(ids.has(id), `${quality.id} → ${id}`).toBe(true);
    }
  });
});
