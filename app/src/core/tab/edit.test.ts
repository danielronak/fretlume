import { describe, expect, it } from 'vitest';
import {
  barFill,
  createEditor,
  edit,
  noteAt,
  TWO_DIGIT_MS,
  type EditAction,
  type EditorState,
} from './edit';
import { newTab, TPQ } from './model';

const run = (s: EditorState, ...actions: EditAction[]) => actions.reduce(edit, s);
const fresh = () => createEditor(newTab('t', 'T', 2));

describe('tab editor', () => {
  it('moves across beats and bars, clamps strings', () => {
    let s = fresh();
    s = run(s, { type: 'move', beats: 5 });
    expect(s.cursor).toEqual({ bar: 1, beat: 1, string: 1 });
    s = run(s, { type: 'move', beats: -3 });
    expect(s.cursor).toEqual({ bar: 0, beat: 2, string: 1 });
    s = run(s, { type: 'move', strings: -1 }, { type: 'move', strings: 9 });
    expect(s.cursor.string).toBe(6);
    s = run(s, { type: 'end' });
    expect(s.cursor.beat).toBe(3);
    s = run(s, { type: 'home' }, { type: 'moveBar', bars: 1 });
    expect(s.cursor).toMatchObject({ bar: 1, beat: 0 });
    s = run(s, { type: 'move', beats: 99 });
    expect(s.cursor).toMatchObject({ bar: 1, beat: 3 });
  });

  it('digits write frets; two quick digits make a two-digit fret; slow ones do not', () => {
    let s = run(
      fresh(),
      { type: 'digit', digit: 1, tMs: 0 },
      { type: 'digit', digit: 2, tMs: 300 },
    );
    expect(noteAt(s.tab, s.cursor)?.fret).toBe(12);
    s = run(
      fresh(),
      { type: 'digit', digit: 1, tMs: 0 },
      { type: 'digit', digit: 2, tMs: TWO_DIGIT_MS + 1 },
    );
    expect(noteAt(s.tab, s.cursor)?.fret).toBe(2);
    s = run(fresh(), { type: 'digit', digit: 2, tMs: 0 }, { type: 'digit', digit: 7, tMs: 100 });
    expect(noteAt(s.tab, s.cursor)?.fret).toBe(7); // 27 > 24
    s = run(fresh(), { type: 'digit', digit: 5, tMs: 0 }, { type: 'digit', digit: 1, tMs: 100 });
    expect(noteAt(s.tab, s.cursor)?.fret).toBe(1); // 5 cannot start a two-digit fret
  });

  it('techniques toggle; bends get a whole step; a technique needs a note', () => {
    let s = run(fresh(), { type: 'tech', tech: 'h' });
    expect(s.past).toHaveLength(0);
    s = run(fresh(), { type: 'fret', fret: 7 }, { type: 'tech', tech: 'b' });
    expect(noteAt(s.tab, s.cursor)).toEqual({ string: 1, fret: 7, tech: 'b', bendSemis: 2 });
    s = run(s, { type: 'tech', tech: 'h' });
    expect(noteAt(s.tab, s.cursor)).toEqual({ string: 1, fret: 7, tech: 'h' });
    s = run(s, { type: 'tech', tech: 'h' });
    expect(noteAt(s.tab, s.cursor)).toEqual({ string: 1, fret: 7 });
    s = run(s, { type: 'clear' });
    expect(noteAt(s.tab, s.cursor)).toBeUndefined();
    expect(s.tab.tracks[0]!.bars[0]!.beats[0]!.rest).toBe(true);
  });

  it('durations double and halve within limits; bar fill shows short and long bars', () => {
    let s = run(fresh(), { type: 'duration', op: 'halve' });
    expect(s.tab.tracks[0]!.bars[0]!.beats[0]!.durTicks).toBe(TPQ / 2);
    expect(barFill(s.tab)[0]).toBeCloseTo(0.875, 9);
    s = run(
      s,
      { type: 'duration', op: 'double' },
      { type: 'duration', op: 'double' },
      { type: 'duration', op: 'double' },
      { type: 'duration', op: 'double' },
    );
    expect(s.tab.tracks[0]!.bars[0]!.beats[0]!.durTicks).toBe(TPQ * 4);
    expect(barFill(s.tab)[0]).toBeCloseTo(7 / 4, 9);
    s = run(s, { type: 'setDuration', ticks: 1 });
    expect(s.tab.tracks[0]!.bars[0]!.beats[0]!.durTicks).toBe(TPQ * 4);
  });

  it('beats and bars: insert, delete, copy, paste; never fewer than one', () => {
    let s = run(fresh(), { type: 'insertBeat' });
    expect(s.tab.tracks[0]!.bars[0]!.beats).toHaveLength(5);
    expect(s.cursor.beat).toBe(1);
    s = run(s, { type: 'deleteBeat' });
    expect(s.tab.tracks[0]!.bars[0]!.beats).toHaveLength(4);
    s = run(
      s,
      { type: 'goto', cursor: { bar: 0, beat: 0, string: 2 } },
      { type: 'fret', fret: 3 },
      { type: 'copyBar' },
      { type: 'pasteBar' },
    );
    expect(s.tab.tracks[0]!.bars).toHaveLength(3);
    expect(s.cursor.bar).toBe(1);
    expect(noteAt(s.tab, { bar: 1, beat: 0, string: 2 })?.fret).toBe(3);
    s = run(s, { type: 'insertBar' });
    expect(s.tab.tracks[0]!.bars).toHaveLength(4);
    s = run(
      s,
      { type: 'deleteBar' },
      { type: 'deleteBar' },
      { type: 'deleteBar' },
      { type: 'deleteBar' },
    );
    expect(s.tab.tracks[0]!.bars).toHaveLength(1);
    const one = createEditor({
      ...newTab('t', 'T', 1),
      tracks: [{ bars: [{ beats: [{ durTicks: TPQ, notes: [] }] }] }],
    });
    expect(run(one, { type: 'deleteBeat' }).tab).toBe(one.tab);
  });

  it('chord symbols and properties; undo and redo walk the history', () => {
    let s = run(
      fresh(),
      { type: 'chord', bar: 1, symbol: ' Am7 ' },
      { type: 'meta', patch: { tempoBpm: 70, capo: 2 } },
    );
    expect(s.tab.tracks[0]!.bars[1]!.chordSymbol).toBe('Am7');
    expect([s.tab.tempoBpm, s.tab.capo]).toEqual([70, 2]);
    s = run(s, { type: 'undo' });
    expect(s.tab.tempoBpm).toBe(90);
    s = run(s, { type: 'undo' });
    expect(s.tab.tracks[0]!.bars[1]!.chordSymbol).toBeUndefined();
    s = run(s, { type: 'undo' });
    expect(s.past).toHaveLength(0);
    s = run(s, { type: 'redo' }, { type: 'redo' });
    expect(s.tab.tempoBpm).toBe(70);
    s = run(s, { type: 'chord', bar: 1, symbol: '' }, { type: 'redo' });
    expect(s.tab.tracks[0]!.bars[1]!.chordSymbol).toBeUndefined();
    expect(s.future).toHaveLength(0);
    const loaded = run(s, { type: 'load', tab: newTab('x', 'X') });
    expect(loaded.past).toHaveLength(0);
  });

  it('a two-digit fret is one undo step', () => {
    let s = run(
      fresh(),
      { type: 'digit', digit: 1, tMs: 0 },
      { type: 'digit', digit: 0, tMs: 200 },
    );
    expect(noteAt(s.tab, s.cursor)?.fret).toBe(10);
    s = run(s, { type: 'undo' });
    expect(noteAt(s.tab, s.cursor)).toBeUndefined();
  });
});
