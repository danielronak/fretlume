import { describe, expect, it } from 'vitest';
import { newTab, timeline, TPQ, type Tab } from './model';
import { chordGhostFrets, playAlongFrame, playAlongShape } from './playalong';

function riff(): Tab {
  const tab = newTab('p', 'P', 2);
  tab.capo = 2;
  const [b1, b2] = tab.tracks[0]!.bars;
  b1!.chordSymbol = 'Am';
  b1!.beats = [
    { durTicks: TPQ, notes: [{ string: 3, fret: 2 }] },
    {
      durTicks: TPQ,
      notes: [
        { string: 2, fret: 1 },
        { string: 6, fret: 0, tech: 'x' },
      ],
    },
    { durTicks: TPQ * 2, notes: [], rest: true },
  ];
  b2!.chordSymbol = 'G';
  return tab;
}

const opts = { lookaheadTicks: TPQ * 2, beatTicks: TPQ, capo: 2 };

describe('play-along frame', () => {
  it('current notes, progress, and upcoming rings with lead getting smaller', () => {
    const beats = timeline(riff());
    const f = playAlongFrame(beats, TPQ / 4, opts);
    expect(f.index).toBe(0);
    expect(f.current).toEqual([{ string: 3, fret: 2 }]);
    expect(f.progress).toBeCloseTo(0.25, 9);
    // The muted note is not drawn; the pull toward the next note is lead (480 − 120) / 960.
    expect(f.upcoming).toEqual([{ string: 2, fret: 3, lead: 0.375 }]);
    expect(f.chord).toBe('Am');
    expect(f.nextChord).toBeNull();
  });

  it('rests show nothing sounding; the next chord appears one beat before its bar', () => {
    const beats = timeline(riff());
    const early = playAlongFrame(beats, TPQ * 2.5, opts);
    expect(early.current).toEqual([]);
    expect(early.nextChord).toBeNull();
    const late = playAlongFrame(beats, TPQ * 3.2, opts);
    expect(late.nextChord).toBe('G');
    expect(playAlongFrame(beats, -10, opts).index).toBe(-1);
  });

  it('the shape: sounding notes in "now", the next chord as ghosts in "next", capo applied', () => {
    const tab = riff();
    const frame = playAlongFrame(timeline(tab), TPQ * 3.2, opts);
    const shape = playAlongShape(tab, { ...frame, current: [{ string: 1, fret: 0 }] });
    const now = shape.marks.filter((m) => m.groups.includes('now'));
    expect(now.map((m) => [m.string, m.fret, m.midi])).toEqual([[1, 2, 66]]);
    const next = shape.marks.filter((m) => m.groups.includes('next'));
    // Open G (3-2-0-0-0-3) moved up two frets by the capo.
    expect(next.map((m) => m.fret).sort((a, b) => a - b)).toEqual([2, 2, 2, 4, 5, 5]);
    expect(chordGhostFrets('Zz', tab.tuning)).toBeNull();
  });
});
