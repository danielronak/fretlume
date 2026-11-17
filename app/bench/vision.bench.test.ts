/**
 * Vision benchmarks (docs/specs/01-vision.md §9). Writes docs/benchmarks/vision-phase3.json.
 * Frames come from ml/synth and are generated on first run into fixtures/generated/bench/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EdgeTracker, isSuccess, trackingError } from '@vision/edgeTracker';
import type { Mat3 } from '@vision/geometry';
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
