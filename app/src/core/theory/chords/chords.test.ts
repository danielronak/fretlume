import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { mod, parseNote, pcName, spelledPc } from '../pitch';
import { midiAt, STANDARD_TUNING, TUNINGS, withCapo } from '../tuning';
import { inferFingering } from './fingering';
import { identifyChord } from './identify';
import {
  cagedChordSet,
  cagedChordShape,
  CHORD_QUALITIES,
  chordName,
  chordPcs,
  chordQuality,
  chordSymbol,
  chordVoicings,
  formatFrets,
  fretSpan,
  parseFingers,
  parseFrets,
  SEED_VOICINGS,
  shiftFrets,
  soundingPositions,
  voicingIsValid,
  voicingToShape,
} from './index';

const pc = (name: string) => spelledPc(parseNote(name)!);
const bassPc = (frets: number[]) =>
  mod(Math.min(...soundingPositions(frets).map((p) => midiAt(STANDARD_TUNING, p))), 12);

describe('notation', () => {
  it('parses chord-chart notation low string first', () => {
    expect(parseFrets('x32010')).toEqual([0, 1, 0, 2, 3, -1]);
    expect(parseFrets('x-10-12-12-11-10')).toEqual([10, 11, 12, 12, 10, -1]);
    expect(formatFrets(parseFrets('x32010'))).toBe('x32010');
    expect(formatFrets(parseFrets('x-10-12-12-11-10'))).toBe('x-10-12-12-11-10');
    expect(parseFingers('x32010')).toEqual([0, 1, 0, 2, 3, 0]);
    expect(() => parseFrets('x3z010')).toThrow();
  });
});

describe('quality table', () => {
  it('has the 26 planned qualities with unique ids and suffixes', () => {
    expect(CHORD_QUALITIES).toHaveLength(26);
    expect(new Set(CHORD_QUALITIES.map((q) => q.id)).size).toBe(26);
    expect(new Set(CHORD_QUALITIES.map((q) => q.suffix)).size).toBe(26);
  });

  it('essential tones are part of the formula and include the root', () => {
    for (const q of CHORD_QUALITIES) {
      expect(q.essential, q.id).toContain('1');
      for (const d of q.essential) expect(q.degrees, q.id).toContain(d);
    }
  });

  it('spells chord tones', () => {
    expect(chordPcs(pc('C'), chordQuality('maj7')).map((p) => pcName(p))).toEqual([
      'C',
      'E',
      'G',
      'B',
    ]);
    expect(chordPcs(pc('A'), chordQuality('m7b5')).map((p) => pcName(p, 'flat'))).toEqual([
      'A',
      'C',
      'Eb',
      'G',
    ]);
    expect(chordSymbol(pc('F#'), chordQuality('m7'))).toBe('F#m7');
    expect(chordSymbol(pc('Bb'), chordQuality('maj'))).toBe('Bb');
    expect(chordName(pc('C'), chordQuality('maj'))).toBe('C major');
  });
});

describe('seed voicings', () => {
  it('every seed spells its chord with the root in the bass', () => {
    for (const seed of SEED_VOICINGS) {
      const label = `${seed.root}${seed.quality} ${formatFrets(seed.frets)}`;
      const root = pc(seed.root);
      const result = voicingIsValid(root, chordQuality(seed.quality), seed.frets);
      expect(result, label).toEqual({ ok: true });
      expect(bassPc(seed.frets), label).toBe(root);
    }
  });

  it('fingerings only put fingers on fretted strings and fit one hand', () => {
    for (const seed of SEED_VOICINGS) {
      const label = `${seed.root}${seed.quality} ${formatFrets(seed.frets)}`;
      seed.frets.forEach((fret, i) => {
        const finger = seed.fingers[i];
        if (fret <= 0) expect(finger, label).toBe(0);
        else expect(finger, label).not.toBe(0);
      });
      expect(fretSpan(seed.frets), label).toBeLessThanOrEqual(3);
    }
  });

  it('movable seeds stay playable when moved up the neck', () => {
    const unplayable: string[] = [];
    for (const seed of SEED_VOICINGS.filter((s) => s.movable)) {
      for (const shift of [1, 3, 5]) {
        const moved = shiftFrets(seed.movedFrets ?? seed.frets, shift);
        if (!inferFingering(moved)) unplayable.push(`${seed.root}${seed.quality} +${shift}`);
      }
    }
    expect(unplayable).toEqual([]);
  });
});

describe('fingering inference', () => {
  const infer = (frets: string) => {
    const result = inferFingering(parseFrets(frets));
    return result ? [...result.fingers].reverse().join('') : null;
  };

  it('fingers the first chords the usual way', () => {
    expect(infer('x32010')).toBe('032010'); // C
    expect(infer('320003')).toBe('210003'); // G
    expect(infer('xx0232')).toBe('000132'); // D
    expect(infer('022000')).toBe('023000'); // Em
    expect(infer('x02210')).toBe('002310'); // Am
    expect(infer('x21202')).toBe('021304'); // B7
  });

  it('uses a barre for barre chords and reports it', () => {
    expect(infer('133211')).toBe('134211'); // F
    expect(infer('x24432')).toBe('013421'); // Bm
    expect(infer('131111')).toBe('131111'); // Fm7
    const f = inferFingering(parseFrets('133211'));
    expect(f?.barre).toEqual({ fret: 1, fromString: 6, toString: 1 });
  });

  it('does not barre across an open string', () => {
    expect(inferFingering(parseFrets('x02220'))?.barre).toBeUndefined(); // A: string 1 is open
    expect(infer('x02220')).toBe('001230');
  });

  it('rejects shapes that need more than four fingers', () => {
    expect(inferFingering(parseFrets('123450'))).toBeNull();
  });

  it('agrees with at least 90 % of the authored fingerings', () => {
    let agree = 0;
    const misses: string[] = [];
    for (const seed of SEED_VOICINGS) {
      const inferred = inferFingering(seed.frets);
      if (inferred && inferred.fingers.join() === seed.fingers.join()) agree++;
      else misses.push(`${seed.root}${seed.quality} ${formatFrets(seed.frets)}`);
    }
    const ratio = agree / SEED_VOICINGS.length;
    expect(ratio, `disagreements: ${misses.join('; ')}`).toBeGreaterThanOrEqual(0.9);
  });

  it('never assigns one finger to two different frets, except a barre at one fret', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1, max: 5 }), { minLength: 6, maxLength: 6 }),
        (frets) => {
          const result = inferFingering(frets);
          if (!result) return;
          const fretByFinger = new Map<number, number>();
          frets.forEach((fret, i) => {
            const finger = result.fingers[i];
            if (fret <= 0) {
              expect(finger).toBe(0);
              return;
            }
            expect(finger).toBeGreaterThanOrEqual(1);
            const seen = fretByFinger.get(finger as number);
            if (seen !== undefined) expect(seen).toBe(fret);
            fretByFinger.set(finger as number, fret);
          });
          // Higher fingers never sit behind lower ones.
          const pairs = [...fretByFinger.entries()].sort((a, b) => a[0] - b[0]);
          for (let i = 1; i < pairs.length; i++)
            expect(pairs[i]![1]).toBeGreaterThanOrEqual(pairs[i - 1]![1]);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('chordVoicings', () => {
  it('gives at least three valid voicings for every root and quality', () => {
    const thin: string[] = [];
    for (let root = 0; root < 12; root++) {
      for (const quality of CHORD_QUALITIES) {
        const voicings = chordVoicings(root, quality.id);
        if (voicings.length < 3) thin.push(`${chordSymbol(root, quality)}: ${voicings.length}`);
        for (const v of voicings) {
          const label = `${chordSymbol(root, quality)} ${formatFrets(v.frets)} (${v.source})`;
          expect(voicingIsValid(root, quality, v.frets), label).toEqual({ ok: true });
          expect(bassPc(v.frets), label).toBe(root);
          expect(fretSpan(v.frets), label).toBeLessThanOrEqual(3);
          expect(v.fingers, label).toBeDefined();
        }
      }
    }
    expect(thin).toEqual([]);
  });

  it('puts the familiar shapes first', () => {
    expect(formatFrets(chordVoicings(pc('C'), 'maj')[0]!.frets)).toBe('x32010');
    expect(formatFrets(chordVoicings(pc('E'), 'min')[0]!.frets)).toBe('022000');
    const f = chordVoicings(pc('F'), 'maj').map((v) => formatFrets(v.frets));
    expect(f).toContain('133211');
    expect(f).toContain('xx3211');
    expect(chordVoicings(pc('B'), 'min').map((v) => formatFrets(v.frets))).toContain('x24432');
  });

  it('moving the root up a semitone moves every moved shape up a fret', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 11 }),
        fc.constantFrom('maj', 'min', '7', 'm7', 'maj7'),
        (root, q) => {
          const here = cagedChordSet(root, q, { maxFret: 30 });
          const up = cagedChordSet(mod(root + 1, 12), q, { maxFret: 30 });
          for (const { form, voicing } of here) {
            const other = up.find((c) => c.form === form);
            if (!other) continue; // a few forms only exist in open position
            // Open-position shapes may differ from their movable version (C7 drops its open top string).
            if (voicing.source !== 'moved' || other.voicing.source !== 'moved') continue;
            const expected = formatFrets(shiftFrets(voicing.frets, 1));
            const wrapped = formatFrets(shiftFrets(voicing.frets, -11));
            expect([expected, wrapped]).toContain(formatFrets(other.voicing.frets));
          }
        },
      ),
    );
  });

  it('respects other standard-interval tunings and a capo', () => {
    // With a capo on 2, a "C shape" sounds D.
    const capo2 = withCapo(STANDARD_TUNING, 2);
    expect(formatFrets(chordVoicings(pc('D'), 'maj', { tuning: capo2 })[0]!.frets)).toBe('x32010');
    // Non-standard intervals: no seeds, but generated shapes are still valid.
    const dadgad = chordVoicings(pc('D'), 'sus4', { tuning: TUNINGS.dadgad });
    expect(dadgad.length).toBeGreaterThan(0);
    for (const v of dadgad) {
      expect(voicingIsValid(pc('D'), chordQuality('sus4'), v.frets, TUNINGS.dadgad).ok).toBe(true);
    }
  });
});

describe('CAGED chords', () => {
  it('lays C major out as C, A, G, E, D shapes up the neck', () => {
    const set = cagedChordSet(pc('C'), 'maj');
    expect(set.map((c) => c.form)).toEqual(['C', 'A', 'G', 'E', 'D']);
    expect(set.map((c) => formatFrets(c.voicing.frets))).toEqual([
      'x32010',
      'x35553',
      '875558',
      '8-10-10-9-8-8',
      'x-x-10-12-13-12',
    ]);
  });

  it('builds one neck-wide shape with a group per form', () => {
    const shape = cagedChordShape(pc('C'), 'maj');
    expect(shape.groups.map((g) => g.id)).toEqual(['C', 'A', 'G', 'E', 'D']);
    expect(shape.marks.every((m) => ['C', 'E', 'G'].includes(m.note))).toBe(true);
    // Neighbouring forms share notes: those marks carry both groups.
    expect(shape.marks.some((m) => m.groups.length === 2)).toBe(true);
    expect(shape.marks.filter((m) => m.role === 'root').every((m) => m.note === 'C')).toBe(true);
  });

  it('covers all five forms for the main qualities in every key', () => {
    for (const q of ['maj', 'min', '7', 'maj7', 'm7']) {
      for (let root = 0; root < 12; root++) {
        const set = cagedChordSet(root, q, { maxFret: 22 });
        expect(set.length, `${q} ${root}`).toBeGreaterThanOrEqual(4);
      }
    }
  });
});

describe('voicingToShape', () => {
  it('labels notes, degrees and fingers', () => {
    const shape = voicingToShape(pc('C'), 'maj', chordVoicings(pc('C'), 'maj')[0]!);
    expect(shape.title).toBe('C major');
    expect(shape.muted).toEqual([6]);
    expect(shape.window).toEqual([1, 3]);
    expect(
      shape.marks.map((m) => `${m.string}:${m.fret}:${m.note}:${m.degree}:${m.finger}:${m.role}`),
    ).toEqual([
      '5:3:C:1:3:root',
      '4:2:E:3:2:tone',
      '3:0:G:5:0:open',
      '2:1:C:1:1:root',
      '1:0:E:3:0:open',
    ]);
  });

  it('spells flat-key chords with flats', () => {
    const shape = voicingToShape(pc('Eb'), 'min', chordVoicings(pc('Eb'), 'min')[0]!);
    expect(new Set(shape.marks.map((m) => m.note))).toEqual(new Set(['Eb', 'Gb', 'Bb']));
  });
});

describe('identifyChord', () => {
  const name = (frets: string) => identifyChord(soundingPositions(parseFrets(frets)))[0]?.symbol;

  it('names common shapes', () => {
    expect(name('x32010')).toBe('C');
    expect(name('x02210')).toBe('Am');
    expect(name('320003')).toBe('G');
    expect(name('xx0212')).toBe('D7');
    expect(name('x02010')).toBe('Am7');
    expect(name('133211')).toBe('F');
    expect(name('022xxx')).toBe('E5');
  });

  it('names inversions as slash chords', () => {
    expect(name('032010')).toBe('C/E');
    expect(name('xx0232')).toBe('D');
    expect(name('2x0232')).toBe('D/F#');
  });

  it('finds the chord it was given, for every authored voicing', () => {
    for (const seed of SEED_VOICINGS) {
      const matches = identifyChord(soundingPositions(seed.frets));
      const hit = matches.some((m) => m.root === pc(seed.root) && m.quality.id === seed.quality);
      expect(hit, `${seed.root}${seed.quality} ${formatFrets(seed.frets)}`).toBe(true);
    }
  });
});
