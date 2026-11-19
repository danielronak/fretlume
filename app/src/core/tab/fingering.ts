/**
 * Where to play pitches that arrive without string and fret (MusicXML without a tab staff): each
 * note goes on its own string, close to where the hand already is. Greedy and simple — good enough
 * to make an imported melody playable; the player can move notes in the editor. Pure.
 */
import { MAX_FRET, type TabNote } from './model';

/**
 * Place simultaneous pitches (MIDI) on strings. `tuning` is high e first; frets are counted from the
 * capo. `handFret` is where the hand is (the previous beat's frets); returns the notes and the new
 * hand position. Pitches that fit nowhere are left out.
 */
export function placePitches(
  midis: readonly number[],
  tuning: readonly number[],
  capo: number,
  handFret: number,
): { notes: TabNote[]; handFret: number } {
  const used = new Set<number>();
  const notes: TabNote[] = [];
  // Highest pitch first, so it gets the highest string it can reach.
  for (const midi of [...midis].sort((a, b) => b - a)) {
    let best: { string: number; fret: number; cost: number } | null = null;
    tuning.forEach((open, i) => {
      const string = i + 1;
      const fret = midi - open - capo;
      if (used.has(string) || fret < 0 || fret > MAX_FRET) return;
      // Stay near the hand; open strings are free; small bias toward lower frets.
      const cost = (fret === 0 ? 0 : Math.abs(fret - handFret)) + fret * 0.1;
      if (!best || cost < best.cost) best = { string, fret, cost };
    });
    if (best) {
      const { string, fret } = best;
      used.add(string);
      notes.push({ string, fret });
    }
  }
  notes.sort((a, b) => a.string - b.string);
  const fretted = notes.filter((n) => n.fret > 0).map((n) => n.fret);
  const next = fretted.length
    ? Math.round(fretted.reduce((s, f) => s + f, 0) / fretted.length)
    : handFret;
  return { notes, handFret: next };
}
