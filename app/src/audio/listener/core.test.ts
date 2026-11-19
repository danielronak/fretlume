import { describe, expect, it } from 'vitest';
import { renderPluck } from '../dsp/karplus';
import { midiHz } from '../analysis/salience';
import { ANALYSIS_RATE as SR, ListenerCore, type ListenerEvent } from './core';

function mix(notes: [number, number][], seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  notes.forEach(([midi, t], i) => {
    const y = renderPluck(midiHz(midi), SR, { seconds: Math.max(0.1, seconds - t), seed: 5 + i });
    const s = Math.round(t * SR);
    for (let k = 0; k < y.length && s + k < out.length; k++) out[s + k]! += 0.4 * y[k]!;
  });
  return out;
}

/** Feed audio in 20 ms blocks, collecting events. */
function run(core: ListenerCore, x: Float32Array): ListenerEvent[] {
  const events: ListenerEvent[] = [];
  for (let i = 0; i < x.length; i += 441) events.push(...core.push(x.subarray(i, i + 441)));
  return events;
}

describe('ListenerCore', () => {
  it('judges each attempt at an expected note: wrong, then right', () => {
    const core = new ListenerCore();
    core.expect({ id: 's1', kind: 'note', notes: [{ string: 3, fret: 2, midi: 57 }] });
    const ev = run(
      core,
      mix(
        [
          [56, 0.3],
          [57, 1.2],
        ],
        2.2,
      ),
    ).filter((e) => e.type === 'note');
    expect(ev.map((e) => e.type === 'note' && [e.check.ok, e.check.heard ?? null])).toEqual([
      [false, 56],
      [true, null],
    ]);
  });

  it('judges a strum once all its plucks are in', () => {
    const core = new ListenerCore();
    const C = [
      { string: 5, fret: 3, midi: 48 },
      { string: 4, fret: 2, midi: 52 },
      { string: 3, fret: 0, midi: 55 },
      { string: 2, fret: 1, midi: 60 },
      { string: 1, fret: 0, midi: 64 },
    ];
    core.expect({ id: 'c', kind: 'chord', notes: C });
    const x = mix(
      C.map((n, k) => [n.midi, 0.3 + k * 0.03] as [number, number]),
      1.6,
    );
    const chords = run(core, x).filter((e) => e.type === 'chord');
    expect(chords).toHaveLength(1);
    expect(chords[0]!.type === 'chord' && chords[0]!.verdict.ok).toBe(true);
  });

  it("ignores the app's own sound", () => {
    const core = new ListenerCore();
    core.expect({ id: 's', kind: 'note', notes: [{ string: 3, fret: 2, midi: 57 }] });
    core.appSound(0.3);
    const ev = run(core, mix([[57, 0.3]], 1.5));
    expect(ev.filter((e) => e.type === 'onset' || e.type === 'note')).toEqual([]);
  });

  it('suggests chords in free play and reports the level', () => {
    const core = new ListenerCore();
    core.setSuggest(true);
    const ev = run(
      core,
      mix(
        [
          [45, 0.1],
          [52, 0.13],
          [57, 0.16],
          [60, 0.19],
          [64, 0.22],
        ],
        1.5,
      ),
    );
    // While the strum rings, Am is among the suggestions.
    const early = ev.filter((e) => e.type === 'suggest' && e.t < 1.1);
    expect(
      early.some((e) => e.type === 'suggest' && e.guesses.some((g) => g.symbol === 'Am')),
    ).toBe(true);
    expect(ev.some((e) => e.type === 'level' && e.rms > 0.01)).toBe(true);
  });
});
