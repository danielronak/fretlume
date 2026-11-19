import { describe, expect, it } from 'vitest';
import { cagedChordShape } from '@core/theory/chords/index';
import { parseProgression } from '@core/theory/chords/parse';
import { scaleShape } from '@core/theory/scales/index';
import { TUNINGS } from '@core/theory/tuning';
import {
  addLayer,
  EMPTY_PLAYGROUND,
  goToChord,
  layerGroup,
  MAX_LAYERS,
  mergeLayers,
  sanitizePlayground,
  stepEntry,
  transposeAll,
  updateLayer,
} from './playground';

const tuning = TUNINGS.standard;
const opts = { tuning, maxFret: 15 };

describe('playground', () => {
  it('adds up to three layers, each in a free colour', () => {
    let s = EMPTY_PLAYGROUND;
    for (const id of ['chord-0-maj', 'scale-9-minor-pentatonic', 'chord-7-maj', 'chord-5-maj'])
      s = addLayer(s, id);
    expect(s.layers).toHaveLength(MAX_LAYERS);
    expect(new Set(s.layers.map((l) => l.color)).size).toBe(3);
    expect(addLayer(EMPTY_PLAYGROUND, 'nonsense').layers).toHaveLength(0);
  });

  it('transposes every layer; steps a layer through its shapes, wrapping', () => {
    let s = addLayer(addLayer(EMPTY_PLAYGROUND, 'chord-0-maj'), 'scale-9-minor-pentatonic');
    s = transposeAll(s, 2);
    expect(s.layers.map((l) => l.itemId)).toEqual(['chord-2-maj', 'scale-11-minor-pentatonic']);
    s = transposeAll(s, -3);
    expect(s.layers[0]!.itemId).toBe('chord-11-maj');
    s = stepEntry(s, 0, -1, 6);
    expect(s.layers[0]!.entry).toBe(5);
    s = stepEntry(s, 0, 1, 6);
    expect(s.layers[0]!.entry).toBe(0);
  });

  it('progression: the first layer shows the current chord; other layers stay', () => {
    const { chords } = parseProgression('C G Am F');
    let s = addLayer(addLayer(EMPTY_PLAYGROUND, 'chord-0-maj'), 'scale-9-minor-pentatonic');
    s = goToChord(s, chords, 2);
    expect(s.layers.map((l) => l.itemId)).toEqual(['chord-9-min', 'scale-9-minor-pentatonic']);
    s = goToChord(s, chords, 4);
    expect([s.chordIndex, s.layers[0]!.itemId]).toEqual([0, 'chord-0-maj']);
    expect(goToChord(EMPTY_PLAYGROUND, chords, 1).layers[0]!.itemId).toBe('chord-7-maj');
  });

  it('merges layers: one dot per position, shared notes split, faint layers as ghosts', () => {
    const chord = cagedChordShape(9, 'min', opts);
    const scale = scaleShape(9, 'minor-pentatonic', 'neck', opts);
    let s = addLayer(addLayer(EMPTY_PLAYGROUND, 'chord-9-min'), 'scale-9-minor-pentatonic');
    s = updateLayer(s, 1, { faint: true });
    const merged = mergeLayers(
      [
        { layer: s.layers[0]!, shape: chord, activeGroups: [] },
        { layer: s.layers[1]!, shape: scale, activeGroups: [] },
      ],
      'Am + A minor pentatonic',
    );
    const keys = merged.marks.map((m) => `${m.string}-${m.fret}`);
    expect(new Set(keys).size).toBe(keys.length);
    const chordGroup = layerGroup(s.layers[0]!.color);
    const scaleGroup = layerGroup(s.layers[1]!.color);
    // Every chord note is in the A minor pentatonic: shared, split, and not a ghost.
    const shared = merged.marks.filter((m) => m.groups.length === 2);
    expect(shared.length).toBeGreaterThan(5);
    expect(shared.every((m) => m.groups[0] === chordGroup && m.groups[1] === scaleGroup)).toBe(
      true,
    );
    expect(shared.every((m) => m.role !== 'ghost')).toBe(true);
    // Scale-only notes are faint.
    expect(
      merged.marks
        .filter((m) => m.groups.length === 1 && m.groups[0] === scaleGroup)
        .every((m) => m.role === 'ghost'),
    ).toBe(true);
  });

  it('a layer showing one shape contributes only that shape; hidden layers nothing', () => {
    const chord = cagedChordShape(0, 'maj', opts);
    let s = addLayer(EMPTY_PLAYGROUND, 'chord-0-maj');
    const one = mergeLayers([{ layer: s.layers[0]!, shape: chord, activeGroups: ['E'] }], 'C');
    expect(one.marks.length).toBeLessThan(chord.marks.length);
    s = updateLayer(s, 0, { visible: false });
    expect(
      mergeLayers([{ layer: s.layers[0]!, shape: chord, activeGroups: [] }], 'C').marks,
    ).toEqual([]);
  });

  it('sanitizes stored state', () => {
    const s = sanitizePlayground({
      layers: [{ itemId: 'chord-0-maj', entry: -2, color: 99, faint: 'yes' }, { itemId: 'zzz' }],
      progression: 42,
      chordIndex: 'x',
    });
    expect(s).toEqual({
      layers: [{ itemId: 'chord-0-maj', entry: 0, color: 3, faint: false, visible: true }],
      progression: '',
      chordIndex: 0,
    });
    expect(sanitizePlayground(null)).toEqual(EMPTY_PLAYGROUND);
  });
});
