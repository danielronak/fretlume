/**
 * Listening benchmarks (docs/specs/02-audio.md §7): gates G6.2–G6.6 on the fixture corpus
 * (`npm run fixtures:audio`). Writes docs/benchmarks/audio-phase6.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { newEnergySpectrum, windowSpectrum } from '@audio/analysis/spectrum';
import {
  decide,
  verifyNote,
  verifyNotes,
  type Leniency,
  type Verdict,
} from '@audio/analysis/verify';
import { refineByTiming, strumFrames } from '@audio/analysis/strum';
import { detectOnsets } from '@audio/analysis/onsets';
import { listenForChord, listenForNote } from '@audio/analysis/listen';
import { chroma, guessChords } from '@audio/analysis/chroma';
import { renderPluck } from '@audio/dsp/karplus';
import { midiHz } from '@audio/analysis/salience';
import { ROOT } from './data';
import { readWav } from './wav';
import type { PlanItem } from './audioPlan';

const DIR = resolve(ROOT, 'fixtures/generated/audio');
const OUT = resolve(ROOT, 'docs/benchmarks/audio-phase6.json');
const results: Record<string, unknown> = existsSync(OUT)
  ? JSON.parse(readFileSync(OUT, 'utf8'))
  : {};
const save = () => {
  mkdirSync(resolve(ROOT, 'docs/benchmarks'), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(results, null, 2)}\n`);
};

interface ManifestItem extends PlanItem {
  start: number;
  condition: string;
}
interface ManifestGroup {
  file: string;
  group: string;
  source: string;
  augmented: boolean;
  items: ManifestItem[];
}
const manifest = (): {
  sampleRate: number;
  groups: ManifestGroup[];
  sourceLatencyS?: Record<string, number>;
} => JSON.parse(readFileSync(resolve(DIR, 'manifest.json'), 'utf8'));
const have = existsSync(resolve(DIR, 'manifest.json'));
const STANDARD = [64, 59, 55, 50, 45, 40];
const TIMING = process.env.NO_TIMING !== '1';

const cache = new Map<string, Float32Array>();
function audio(file: string): Float32Array {
  if (!cache.has(file)) cache.set(file, readWav(resolve(DIR, file)).samples);
  return cache.get(file)!;
}

function judge(g: ManifestGroup, item: ManifestItem, sr: number, leniency: Leniency): Verdict {
  // The window starts after the last pluck of the strum (the listener finds it from the onsets).
  const onset = item.start + Math.max(...item.notes.map((n) => n.t));
  const spec = windowSpectrum(audio(g.file), sr, Math.round(onset * sr), {
    n: 8192,
    durationS: 0.45,
  });
  const v = verifyNotes(spec, sr, item.expected, {
    muted: item.muted.map((s) => ({ string: s, midi: STANDARD[s - 1]! })),
    leniency,
  });
  if (!TIMING) return v;
  // Strum timing for doubled notes: frames from just before the first pluck to after the last.
  const first = item.start + Math.min(...item.notes.map((n) => n.t));
  const frames = strumFrames(
    audio(g.file),
    Math.round((first - 0.03) * sr),
    Math.round((onset + 0.08) * sr),
  );
  return decide(refineByTiming(v.perNote, frames, sr), v.extra, leniency);
}

describe.skipIf(!have)('audio benchmarks', () => {
  it('G6.2 single notes: right pitch passes, neighbours and octaves do not', () => {
    const m = manifest();
    const out: Record<string, unknown> = {};
    let tp = 0,
      fn = 0,
      fp = 0,
      octaveFalse = 0,
      octaveTrials = 0;
    const byD: Record<number, number> = {};
    for (const g of m.groups.filter((x) => x.group === 'notes' || x.group === 'phrases')) {
      let gtp = 0,
        gfn = 0,
        gfp = 0,
        gn = 0;
      for (const item of g.items)
        for (const note of item.notes) {
          const at = Math.round((item.start + note.t) * m.sampleRate);
          // Phrases: earlier notes still ring, so only the new energy counts.
          const spec =
            item.kind === 'phrase'
              ? newEnergySpectrum(audio(g.file), m.sampleRate, at)
              : windowSpectrum(audio(g.file), m.sampleRate, at, { durationS: 0.35 });
          const a4 = 440 * 2 ** (item.detuneCents / 1200);
          const check = (midi: number) => verifyNote(spec, m.sampleRate, midi, { a4Hz: a4 }).ok;
          gn++;
          if (check(note.midi)) gtp++;
          else gfn++;
          for (const d of [-2, -1, 1, 2, -12, 12]) {
            const wrongPass = check(note.midi + d);
            if (wrongPass) {
              gfp++;
              byD[d] = (byD[d] ?? 0) + 1;
            }
            if (Math.abs(d) === 12) {
              octaveTrials++;
              if (wrongPass) octaveFalse++;
            }
          }
        }
      tp += gtp;
      fn += gfn;
      fp += gfp;
      const f1 = (2 * gtp) / (2 * gtp + gfn + gfp);
      out[g.file] = { n: gn, recall: +(gtp / gn).toFixed(4), falsePasses: gfp, f1: +f1.toFixed(4) };
      console.log(g.file.padEnd(26), JSON.stringify(out[g.file]));
    }
    const f1 = (2 * tp) / (2 * tp + fn + fp);
    results.G6_2 = {
      ...out,
      overall: {
        f1: +f1.toFixed(4),
        falsePassesByInterval: byD,
        octaveErrorRate: +(octaveFalse / octaveTrials).toFixed(4),
      },
      gate: 'F1 ≥ 0.97, octave errors ≤ 0.5 %',
    };
    save();
  });

  it('G6.4 onset timing on the phrases', () => {
    const m = manifest();
    const out: Record<string, unknown> = {};
    const all: number[] = [];
    for (const g of m.groups.filter((x) => x.group === 'phrases')) {
      const x = audio(g.file);
      const errs: number[] = [];
      let missed = 0;
      let extra = 0;
      // FluidSynth's samples start a few ms after note-on: time the truth to when sound starts.
      const latency = m.sourceLatencyS?.[g.source] ?? 0;
      for (const item of g.items) {
        const a = Math.round((item.start - 0.1) * m.sampleRate);
        const b = Math.round((item.start + item.dur) * m.sampleRate);
        const onsets = detectOnsets(x.subarray(a, b), { sampleRate: m.sampleRate }).map(
          (t) => t + a / m.sampleRate - item.start,
        );
        const used = new Set<number>();
        for (const note of item.notes) {
          let best = -1;
          let bestErr = Infinity;
          onsets.forEach((t, i) => {
            const e = Math.abs(t - note.t - latency);
            if (e < bestErr && !used.has(i)) {
              bestErr = e;
              best = i;
            }
          });
          if (best < 0 || bestErr > 0.05) missed++;
          else {
            used.add(best);
            errs.push(bestErr * 1000);
          }
        }
        extra += onsets.length - used.size;
      }
      errs.sort((p, q) => p - q);
      all.push(...errs);
      out[g.file] = {
        notes: errs.length + missed,
        missed,
        extra,
        medianMs: +(errs[errs.length >> 1] ?? NaN).toFixed(2),
        p90Ms: +(errs[Math.floor(errs.length * 0.9)] ?? NaN).toFixed(2),
      };
      console.log(g.file.padEnd(26), JSON.stringify(out[g.file]));
    }
    all.sort((p, q) => p - q);
    results.G6_4 = {
      ...out,
      overall: { medianMs: +all[all.length >> 1]!.toFixed(2) },
      gate: 'median |Δ| ≤ 12 ms',
    };
    save();
  });

  it('G6.3 string-by-string mode', () => {
    const m = manifest();
    const out: Record<string, unknown> = {};
    for (const g of m.groups.filter((x) => x.group === 'sbs')) {
      let clean = 0,
        cleanOk = 0,
        muted = 0,
        mutedFound = 0,
        wrongName = 0;
      for (const item of g.items) {
        // Each string of the shape in turn, low to high, 0.9 s apart (as the plan plays them).
        item.expected.forEach((n, k) => {
          const slot = item.start + 0.1 + k * 0.9;
          const a = Math.round((slot - 0.15) * m.sampleRate);
          const b = Math.round((slot + 0.75) * m.sampleRate);
          const r = listenForNote(audio(g.file).subarray(a, b), n.midi, {
            sampleRate: m.sampleRate,
            t0: a / m.sampleRate,
            a4Hz: 440 * 2 ** (item.detuneCents / 1200),
          });
          const ok = r.check?.ok ?? false;
          if (item.fault?.string === n.string) {
            muted++;
            if (!ok) mutedFound++;
            if (r.check?.state === 'wrong') wrongName++;
          } else {
            clean++;
            if (ok) cleanOk++;
          }
        });
      }
      out[g.file] = {
        strings: clean + muted,
        playedPassed: +(cleanOk / clean).toFixed(4),
        mutedRecall: +(mutedFound / muted).toFixed(4),
        mutedCalledWrongNote: wrongName,
      };
      console.log(g.file.padEnd(16), JSON.stringify(out[g.file]));
    }
    results.G6_3_stringByString = { ...out, gate: 'muted-string recall ≥ 0.97' };
    save();
  });

  it("G6.5 self-masking: the app's own reference tone does not pass for the player", () => {
    const m = manifest();
    const sr = m.sampleRate;
    const g = m.groups.find((x) => x.file === 'notes-steel.wav')!;
    const steel = audio(g.file);
    let silentTrials = 0,
      falsePasses = 0,
      playedTrials = 0,
      playedPasses = 0;
    g.items.forEach((item, i) => {
      const midi = item.notes[0]!.midi;
      // The app plays the reference note at −12 dB relative to the player's level.
      const level = Math.max(
        ...steel
          .subarray(Math.round(item.start * sr), Math.round((item.start + 0.5) * sr))
          .map(Math.abs),
      );
      const ref = renderPluck(midiHz(midi), sr, { seconds: 1.5, seed: 100 + i });
      const refPeak = Math.max(...ref.map(Math.abs));
      const appAt = 0.2;
      const mixLen = Math.round(1.6 * sr);
      for (const playerPlays of [false, true]) {
        const x = new Float32Array(mixLen);
        for (let k = 0; k < ref.length && Math.round(appAt * sr) + k < mixLen; k++)
          x[Math.round(appAt * sr) + k] = (ref[k]! / refPeak) * level * 10 ** (-12 / 20);
        if (playerPlays) {
          // The player plays the note 0.5 s after the reference starts.
          const src = steel.subarray(Math.round((item.start + item.notes[0]!.t - 0.02) * sr));
          const at = Math.round(0.7 * sr);
          for (let k = 0; at + k < mixLen; k++) x[at + k]! += src[k]!;
        }
        const r = listenForNote(x, midi, { sampleRate: sr, appOnsets: [appAt] });
        const pass = r.check?.ok ?? false;
        if (playerPlays) {
          playedTrials++;
          if (pass) playedPasses++;
        } else {
          silentTrials++;
          if (pass) falsePasses++;
        }
      }
    });
    results.G6_5 = {
      silentTrials,
      falsePassRate: +(falsePasses / silentTrials).toFixed(4),
      playedPassRate: +(playedPasses / playedTrials).toFixed(4),
      gate: 'false passes ≤ 2 % with the reference tone at −12 dB',
    };
    console.log(JSON.stringify(results.G6_5));
    save();
  });

  it('G6.6 analysis cost on this machine', () => {
    const m = manifest();
    const sr = m.sampleRate;
    const g = m.groups.find((x) => x.file === 'chords-steel.wav')!;
    const items = g.items.slice(0, 60);
    const x = audio(g.file);
    const t0 = performance.now();
    let audioSeconds = 0;
    for (const item of items) {
      // Real-time load: onsets over the whole item + one chord verification (+ strum timing).
      const a = Math.round(item.start * sr);
      const b = Math.round((item.start + item.dur) * sr);
      listenForChord(x.subarray(a, b), item.expected, { sampleRate: sr });
      audioSeconds += item.dur;
    }
    const ms = performance.now() - t0;
    results.G6_6 = {
      audioSeconds: +audioSeconds.toFixed(1),
      cpuSeconds: +(ms / 1000).toFixed(2),
      shareOfOneCore: +(ms / 1000 / audioSeconds).toFixed(4),
      gate: '≤ 25 % of one core',
      note: 'One strum per 2.2 s with onset detection running throughout; container CPU, Node.',
    };
    console.log(JSON.stringify(results.G6_6));
    save();
  });

  it('chroma suggestions (report only)', () => {
    const m = manifest();
    const out: Record<string, unknown> = {};
    for (const g of m.groups.filter((x) => x.group === 'chords' && !x.augmented)) {
      let top1 = 0,
        top3 = 0;
      for (const item of g.items) {
        const [rootPc, quality] = item.id.split('-').slice(1, 3) as [string, string];
        const last = Math.max(...item.notes.map((n) => n.t));
        const spec = windowSpectrum(
          audio(g.file),
          m.sampleRate,
          Math.round((item.start + last) * m.sampleRate),
          { n: 8192, durationS: 0.45 },
        );
        const guesses = guessChords(chroma(spec, m.sampleRate));
        const hit = (x: { root: number; quality: string }) =>
          x.root === Number(rootPc) && x.quality === quality;
        if (hit(guesses[0]!)) top1++;
        if (guesses.some(hit)) top3++;
      }
      out[g.file] = {
        n: g.items.length,
        top1: +(top1 / g.items.length).toFixed(3),
        top3: +(top3 / g.items.length).toFixed(3),
      };
    }
    results.chroma = out;
    console.log(JSON.stringify(out));
    save();
  });

  it('G6.3 chord verification', () => {
    const m = manifest();
    const out: Record<string, unknown> = {};
    for (const leniency of ['relaxed', 'standard', 'strict'] as const) {
      for (const g of m.groups.filter((x) => x.group === 'chords' || x.group === 'faults')) {
        const key = `${g.group}-${g.source}${g.augmented ? '-aug' : ''}`;
        let right = 0;
        let mutedFound = 0;
        let mutedTotal = 0;
        const reasons: Record<string, number> = {};
        for (const item of g.items) {
          const v = judge(g, item, m.sampleRate, leniency);
          const shouldPass = !item.fault;
          if (v.ok === shouldPass) right++;
          else {
            const why = shouldPass
              ? v.perNote
                  .filter((n) => n.state !== 'present')
                  .map((n) => n.state)
                  .join('+') || `extra${v.extra.length}`
              : item.fault!.kind;
            reasons[why] = (reasons[why] ?? 0) + 1;
          }
          if (item.fault?.kind === 'muted') {
            mutedTotal++;
            const n = v.perNote.find((x) => x.string === item.fault!.string);
            if (n && (n.state === 'missing' || n.state === 'weak' || n.state === 'wrong'))
              mutedFound++;
          }
        }
        const entry = {
          n: g.items.length,
          accuracy: +(right / g.items.length).toFixed(4),
          ...(mutedTotal ? { mutedRecall: +(mutedFound / mutedTotal).toFixed(4) } : {}),
          errors: reasons,
        };
        out[`${leniency}/${key}`] = entry;
        console.log(leniency.padEnd(9), key.padEnd(18), JSON.stringify(entry));
      }
    }
    // Gate view: per leniency, clean strums passed, faults caught, muted-string recall, overall.
    const summary: Record<string, unknown> = {};
    for (const len of ['relaxed', 'standard', 'strict']) {
      const rows = Object.entries(out) as [
        string,
        { n: number; accuracy: number; mutedRecall?: number },
      ][];
      const pick = (kind: string) =>
        rows.filter(([k]) => k.startsWith(`${len}/${kind}`)).map(([, v]) => v);
      const mean = (vs: { n: number; accuracy: number }[]) =>
        vs.reduce((a, v) => a + v.accuracy * v.n, 0) / vs.reduce((a, v) => a + v.n, 0);
      const clean = pick('chords');
      const faults = pick('faults');
      const all = [...clean, ...faults];
      summary[len] = {
        cleanPass: +mean(clean).toFixed(4),
        falseFail: +(1 - mean(clean)).toFixed(4),
        faultsCaught: +mean(faults).toFixed(4),
        mutedRecallStrum: +(
          faults.reduce((a, v) => a + (v.mutedRecall ?? 0), 0) / faults.length
        ).toFixed(4),
        overallAccuracy: +mean(all).toFixed(4),
      };
    }
    results.G6_3 = {
      summary,
      gate: 'accuracy ≥ 0.92 overall; false-fail ≤ 5 % (standard); muted recall ≥ 0.75 strum, ≥ 0.97 string-by-string',
      detail: out,
    };
    save();
    expect(out).toBeTruthy();
  });
});
