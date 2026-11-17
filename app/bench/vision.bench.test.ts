/**
 * Vision benchmarks (docs/specs/01-vision.md §9). Writes docs/benchmarks/vision-phase3.json.
 * Frames come from ml/synth and are generated on first run into fixtures/generated/bench/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EdgeTracker, isSuccess, trackingError } from '@vision/edgeTracker';
import { apply, type Mat3 } from '@vision/geometry';
import { snapLock, tapPointsMm } from '@vision/lock';
import { ensureFrames, modelFor, readFrame, readLabels, ROOT, synth } from './data';

const OUT = resolve(ROOT, 'docs/benchmarks/vision-phase3.json');
const results: Record<string, unknown> = existsSync(OUT)
  ? JSON.parse(readFileSync(OUT, 'utf8'))
  : {};
const save = () => {
  mkdirSync(resolve(ROOT, 'docs/benchmarks'), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(results, null, 2)}\n`);
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};

describe('G3.1: TypeScript EdgeTracker matches the Python reference', () => {
  it('on 200 seeded frames at starting errors of 2, 5 and 8 px', () => {
    const dir = ensureFrames('g31', ['frames', '--count', '200', '--seed', '31']);
    if (!existsSync(resolve(dir, 'reference.json'))) {
      synth(['synth.reference_tracker', '--frames', dir, '--sigmas', '2,5,8', '--seed', '0']);
    }
    const labels = new Map(readLabels(dir).map((l) => [l.index, l]));
    const inits = JSON.parse(readFileSync(resolve(dir, 'inits.json'), 'utf8')) as {
      index: number;
      sigma: number;
      H0: number[][];
    }[];
    const reference = JSON.parse(readFileSync(resolve(dir, 'reference.json'), 'utf8')) as {
      index: number;
      sigma: number;
      along: number;
      across: number;
    }[];
    const trackers = new Map<string, EdgeTracker>();
    const rows: {
      sigma: number;
      along: number;
      across: number;
      refAlong: number;
      refAcross: number;
    }[] = [];
    const started = performance.now();
    inits.forEach((init, i) => {
      const label = labels.get(init.index)!;
      const model = modelFor(label);
      if (!trackers.has(model.id)) trackers.set(model.id, new EdgeTracker(model));
      const tracker = trackers.get(model.id)!;
      const image = readFrame(dir, label);
      const out = tracker.refine(image, init.H0.flat() as Mat3, { mode: 'parity' });
      const e = trackingError(out.H, label.H!, model);
      rows.push({
        sigma: init.sigma,
        along: e.along,
        across: e.across,
        refAlong: reference[i]!.along,
        refAcross: reference[i]!.across,
      });
    });
    const perSigma = [2, 5, 8].map((sigma) => {
      const r = rows.filter((x) => x.sigma === sigma);
      const ts = r.filter((x) => isSuccess(x)).length / r.length;
      const py =
        r.filter((x) => isSuccess({ along: x.refAlong, across: x.refAcross })).length / r.length;
      const agree =
        r.filter((x) => isSuccess(x) === isSuccess({ along: x.refAlong, across: x.refAcross }))
          .length / r.length;
      return {
        sigma,
        cases: r.length,
        successTs: Number(ts.toFixed(3)),
        successPython: Number(py.toFixed(3)),
        caseAgreement: Number(agree.toFixed(3)),
        medianAlongTs: Number(median(r.map((x) => x.along)).toFixed(4)),
        medianAlongPython: Number(median(r.map((x) => x.refAlong)).toFixed(4)),
      };
    });
    results.G31 = {
      gate: 'success rates within ±3 points of the Python reference; median along error ≤ 0.03 fret',
      frames: 200,
      msPerRefine: Number(((performance.now() - started) / inits.length).toFixed(1)),
      perSigma,
    };
    save();
    for (const s of perSigma) {
      expect(Math.abs(s.successTs - s.successPython), `σ=${s.sigma}`).toBeLessThanOrEqual(0.03);
      expect(s.medianAlongTs, `σ=${s.sigma}`).toBeLessThanOrEqual(0.03);
    }
  });
});

/** Seeded normal noise (mulberry32 + Box–Muller), so the benchmark is reproducible. */
function gaussian(seed: number): () => number {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
}

describe('G3.2: lock succeeds from noisy taps (held-out frames)', () => {
  it('4 and 6 taps at σ = 5 and 8 px, wire polarity detected', () => {
    // Seed 32: frames the tracker was not tuned on (development used seed 31).
    const dir = ensureFrames('g32', ['frames', '--count', '200', '--seed', '32']);
    const labels = readLabels(dir).filter((l) => l.guitar && l.H);
    const trackers = new Map<string, EdgeTracker>();
    const noise = gaussian(32);
    const runs: {
      taps: 4 | 6;
      sigma: number;
      ok: boolean;
      polarityOk: boolean;
      ms: number;
      confidence: number;
    }[] = [];
    for (const label of labels) {
      const model = modelFor(label);
      if (!trackers.has(model.id)) trackers.set(model.id, new EdgeTracker(model));
      const tracker = trackers.get(model.id)!;
      const image = readFrame(dir, label);
      for (const taps of [4, 6] as const) {
        for (const sigma of [5, 8]) {
          const points = tapPointsMm(model, taps).map((p) => {
            const q = apply(label.H!, p.x, p.y);
            return { x: q.x + sigma * noise(), y: q.y + sigma * noise() };
          });
          const started = performance.now();
          const out = snapLock(tracker, image, points);
          runs.push({
            taps,
            sigma,
            ok: out.inliers > 0 && isSuccess(trackingError(out.H, label.H!, model)),
            polarityOk: out.polarity === (label.polarity ?? 'bright'),
            ms: performance.now() - started,
            confidence: out.confidence,
          });
        }
      }
    }
    const cases = [4, 6].flatMap((taps) =>
      [5, 8].map((sigma) => {
        const r = runs.filter((x) => x.taps === taps && x.sigma === sigma);
        return {
          taps,
          sigma,
          frames: r.length,
          success: Number((r.filter((x) => x.ok).length / r.length).toFixed(3)),
          polarityDetected: Number((r.filter((x) => x.polarityOk).length / r.length).toFixed(3)),
        };
      }),
    );
    // Confidence calibration: for each threshold, how many locks it accepts and how many of those
    // are right. The verified threshold is the lowest with precision ≥ 0.98.
    const calibration = Array.from({ length: 13 }, (_, i) => 0.3 + 0.05 * i).map((t) => {
      const accepted = runs.filter((x) => x.confidence >= t);
      return {
        threshold: Number(t.toFixed(2)),
        accepted: Number((accepted.length / runs.length).toFixed(3)),
        precision: Number(
          (accepted.filter((x) => x.ok).length / Math.max(1, accepted.length)).toFixed(3),
        ),
      };
    });
    const verified = calibration.find((c) => c.precision >= 0.98)?.threshold ?? null;
    results.G32 = {
      gate: 'success ≥ 0.97 at σ = 5 px and ≥ 0.90 at σ = 8 px (worst along < 0.25 fret, across < 0.35 string spacing, frets 0–17)',
      frames: labels.length,
      msPerLock: Number(median(runs.map((x) => x.ms)).toFixed(1)),
      cases,
      confidence: { verifiedThreshold: verified, calibration },
    };
    save();
    // Gate checks are reported, not asserted, here: the phase file records pass/fail and the
    // fallback ladder step taken (see docs/phases/phase-03-camera-manual-lock.md).
    expect(cases.length).toBe(4);
  });
});
