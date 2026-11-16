/**
 * Phase-1 exit gate 2: the generated catalogue has sane counts.
 * Run with WRITE_BENCH=1 to refresh docs/benchmarks/catalogue.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHORD_QUALITIES, chordVoicings, SEED_VOICINGS } from './chords/index';
import { inferFingering } from './chords/fingering';
import { buildKey } from './keys';
import { catalogueCounts, libraryCatalogue } from './library/index';
import { cagedPositions, SCALES, scaleTones, threeNpsPositions } from './scales/index';
import { STRING_SETS, TRIAD_QUALITIES, triadVoicings, type TriadQuality } from './triads';

describe('catalogue report', () => {
  it('meets the phase-1 catalogue gate', () => {
    let voicings = 0;
    let minVoicings = Infinity;
    const bySource = { seed: 0, moved: 0, generated: 0 };
    for (let root = 0; root < 12; root++) {
      for (const quality of CHORD_QUALITIES) {
        const list = chordVoicings(root, quality.id);
        voicings += list.length;
        minVoicings = Math.min(minVoicings, list.length);
        for (const v of list) bySource[v.source]++;
      }
    }

    let scalePositions = 0;
    let minPositions = Infinity;
    let npsPositions = 0;
    for (let root = 0; root < 12; root++) {
      for (const scale of SCALES) {
        const n = cagedPositions(scaleTones(root, scale), { maxFret: 15 }).length;
        scalePositions += n;
        minPositions = Math.min(minPositions, n);
        npsPositions += threeNpsPositions(scaleTones(root, scale), { maxFret: 22 }).length;
      }
    }

    let triads = 0;
    for (let root = 0; root < 12; root++)
      for (const quality of Object.keys(TRIAD_QUALITIES) as TriadQuality[])
        for (const set of STRING_SETS)
          triads += triadVoicings(root, quality, set, { maxFret: 15 }).length;

    let keys = 0;
    for (const mode of ['major', 'minor', 'harmonic-minor', 'melodic-minor'] as const)
      for (let tonic = 0; tonic < 12; tonic++)
        keys += buildKey(tonic, mode).triads.length === 7 ? 1 : 0;

    const agreeing = SEED_VOICINGS.filter(
      (seed) => inferFingering(seed.frets)?.fingers.join() === seed.fingers.join(),
    ).length;

    const report = {
      generatedBy: 'app/src/core/theory/catalogue.report.test.ts',
      libraryItems: { ...catalogueCounts(), total: libraryCatalogue().length },
      chords: {
        roots: 12,
        qualities: CHORD_QUALITIES.length,
        seedVoicings: SEED_VOICINGS.length,
        voicings,
        minVoicingsPerChord: minVoicings,
        bySource,
      },
      scales: {
        roots: 12,
        scales: SCALES.length,
        cagedPositionsOn15Frets: scalePositions,
        minCagedPositionsPerScale: minPositions,
        threeNpsPositionsOn22Frets: npsPositions,
      },
      triads: { qualities: 4, stringSets: 4, inversions: 3, voicingsOn15Frets: triads },
      keys: { built: keys },
      fingeringInference: {
        seeds: SEED_VOICINGS.length,
        agreeing,
        agreement: Number((agreeing / SEED_VOICINGS.length).toFixed(4)),
      },
    };

    expect(report.chords.qualities).toBeGreaterThanOrEqual(25);
    expect(report.chords.minVoicingsPerChord).toBeGreaterThanOrEqual(3);
    expect(report.scales.scales).toBeGreaterThanOrEqual(20);
    expect(report.scales.minCagedPositionsPerScale).toBeGreaterThanOrEqual(5);
    expect(report.keys.built).toBe(48);
    expect(report.fingeringInference.agreement).toBeGreaterThanOrEqual(0.9);
    // 12 roots × 4 qualities × 4 string sets × at least 3 inversions on a 15-fret neck
    expect(report.triads.voicingsOn15Frets).toBeGreaterThanOrEqual(12 * 4 * 4 * 3);

    if (process.env.WRITE_BENCH) {
      const file = resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../docs/benchmarks/catalogue.json',
      );
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
    }
  });
});
