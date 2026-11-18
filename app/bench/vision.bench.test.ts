/**
 * Vision benchmarks (docs/specs/01-vision.md §9). Writes docs/benchmarks/vision-phase3.json.
 * Frames come from ml/synth and are generated on first run into fixtures/generated/bench/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EdgeTracker, isSuccess, trackingError } from '@vision/edgeTracker';
import { apply, type Mat3 } from '@vision/geometry';
import { shiftFrets, snapLock, tapPointsMm } from '@vision/lock';
import { ensureClips, ensureFrames, modelFor, readFrame, readLabels, ROOT, synth } from './data';
import { TrackingSession } from '@vision/tracking';
import { AutoLocker } from '@vision/autoLock';
import { detectNeck } from '@vision/neckNet';
import { Network, type Manifest } from '@vision/nn';
import { controlPointsPx } from '@vision/geometry';

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
    const thresholds = [
      ...Array.from({ length: 13 }, (_, i) => 0.3 + 0.05 * i),
      0.925,
      0.95,
      0.975,
    ];
    const calibration = thresholds.map((t) => {
      const accepted = runs.filter((x) => x.confidence >= t);
      return {
        threshold: Number(t.toFixed(3)),
        accepted: Number((accepted.length / runs.length).toFixed(3)),
        precision: Number(
          (accepted.filter((x) => x.ok).length / Math.max(1, accepted.length)).toFixed(3),
        ),
      };
    });
    const verified =
      calibration.find((c) => c.precision >= 0.98 && c.accepted > 0)?.threshold ?? null;
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

const INSTRUMENT_IDS = ['steel-acoustic', 'electric', 'classical'] as const;
const BOARDS = ['rosewood', 'ebony', 'maple', 'pau-ferro', 'richlite'] as const;
const FPS_MS = 1000 / 30;

describe('G3.3–G3.5: tracking after a lock', () => {
  it('60 moving clips with a hand: frames good, index slips, cost', async () => {
    const specs = Array.from({ length: 60 }, (_, i) => ({
      name: `g33-${i}`,
      args: [
        '--kind',
        i % 2 ? 'track-motion' : 'track-hand',
        '--frames',
        '40',
        '--seed',
        String(3300 + i),
        '--instrument',
        INSTRUMENT_IDS[i % 3]!,
        '--board',
        BOARDS[i % 5]!,
      ],
    }));
    const dirs = await ensureClips(specs);
    let frames = 0;
    let good = 0;
    let slips = 0;
    let maxSamples = 0;
    let sumSamples = 0;
    const perClip: { clip: string; good: number; frames: number; slipped: boolean }[] = [];
    const started = performance.now();
    dirs.forEach((dir, c) => {
      const labels = readLabels(dir);
      const model = modelFor(labels[0]!);
      const session = new TrackingSession(new EdgeTracker(model));
      session.lock(labels[0]!.H!, labels[0]!.polarity ?? 'bright', 0, readFrame(dir, labels[0]!));
      let clipGood = 0;
      let slipped = false;
      for (const label of labels.slice(1)) {
        const pose = session.update(readFrame(dir, label), label.index * FPS_MS)!;
        const e = trackingError(pose.H, label.H!, model);
        frames++;
        if (isSuccess(e)) clipGood++;
        if (e.along > 0.75) slipped = true;
        maxSamples = Math.max(maxSamples, session.lastSamples);
        sumSamples += session.lastSamples;
      }
      good += clipGood;
      if (slipped) slips++;
      perClip.push({ clip: specs[c]!.name, good: clipGood, frames: labels.length - 1, slipped });
    });
    results.G33 = {
      gate: '≥ 98 % of frames good (same criterion as G3.2); 0 index slips',
      clips: dirs.length,
      frames,
      goodFrames: Number((good / frames).toFixed(4)),
      clipsWithSlip: slips,
      msPerFrame: Number(((performance.now() - started) / frames).toFixed(1)),
      worstClips: perClip.sort((a, b) => a.good / a.frames - b.good / b.frames).slice(0, 5),
    };
    results.G35 = {
      gate: '≤ 2.0 M image pixel samples per frame in tracking mode',
      meanSamples: Math.round(sumSamples / frames),
      maxSamples,
    };
    save();
    expect(maxSamples).toBeLessThanOrEqual(2_000_000);
  }, 3_600_000);

  it('angle changes at the app frame rate, and recovery from a one-fret slip (G3.3t)', async () => {
    // Field test 2026-11-18: turning or tilting the guitar (or the camera) broke tracking, and the
    // G3.3 clips never changed the angle by more than a few degrees. These clips turn the guitar by
    // 8–25° and tilt it towards or away from the camera; every 4th frame is tracked (≈ 7.5 Hz, as in
    // the app). Second pass: tracking starts one fret off, as after a slip in a fast move.
    const specs = Array.from({ length: 24 }, (_, i) => ({
      name: `tilt-${i}`,
      args: [
        '--kind',
        'track-tilt',
        '--frames',
        '120',
        '--max-speed',
        '12',
        '--seed',
        String(7700 + i),
        '--instrument',
        INSTRUMENT_IDS[i % 3]!,
        '--board',
        BOARDS[i % 5]!,
      ],
    }));
    const dirs = await ensureClips(specs);
    const STRIDE = 4;
    const run = (startShift: number) => {
      let frames = 0;
      let good = 0;
      let wrongShown = 0;
      let corrections = 0;
      let recoveredBy: number[] = [];
      dirs.forEach((dir, c) => {
        const labels = readLabels(dir);
        const model = modelFor(labels[0]!);
        const session = new TrackingSession(new EdgeTracker(model));
        const k0 = startShift * (c % 2 ? 1 : -1);
        const H0 = k0 ? shiftFrets(labels[0]!.H!, model, k0) : labels[0]!.H!;
        session.lock(H0, labels[0]!.polarity ?? 'bright', 0, readFrame(dir, labels[0]!));
        let firstGood = -1;
        for (let k = STRIDE, n = 0; k < labels.length; k += STRIDE, n++) {
          const label = labels[k]!;
          const pose = session.update(readFrame(dir, label), (k * 1000) / 30)!;
          const ok = isSuccess(trackingError(pose.H, label.H!, model));
          frames++;
          if (ok) good++;
          if (ok && firstGood < 0) firstGood = n;
          if (!ok && pose.state === 'locked' && pose.measured) wrongShown++;
        }
        corrections += session.indexCorrections;
        recoveredBy.push(firstGood);
      });
      recoveredBy = recoveredBy.filter((v) => v >= 0);
      return {
        goodFrames: Number((good / frames).toFixed(4)),
        wrongWhileLocked: Number((wrongShown / frames).toFixed(4)),
        indexCorrections: corrections,
        medianFramesToRecover: startShift ? median(recoveredBy) : 0,
      };
    };
    results.G33t = {
      gate: 'none yet (recorded): tracking through angle changes at the app frame rate',
      clips: dirs.length,
      trackedHz: 30 / STRIDE,
      normal: run(0),
      startOneFretOff: run(1),
    };
    save();
  }, 3_600_000);

  it('jitter on static clips with sensor noise (G3.4)', async () => {
    const specs = Array.from({ length: 12 }, (_, i) => ({
      name: `g34-${i}`,
      args: [
        '--kind',
        'static-noise',
        '--frames',
        '40',
        '--seed',
        String(3400 + i),
        '--instrument',
        INSTRUMENT_IDS[i % 3]!,
        '--board',
        BOARDS[i % 5]!,
      ],
    }));
    const dirs = await ensureClips(specs);
    const perClip = dirs.map((dir) => {
      const labels = readLabels(dir);
      const model = modelFor(labels[0]!);
      const session = new TrackingSession(new EdgeTracker(model));
      session.lock(labels[0]!.H!, labels[0]!.polarity ?? 'bright', 0, readFrame(dir, labels[0]!));
      const points: { x: number; y: number }[][] = [];
      for (const label of labels.slice(1)) {
        const pose = session.update(readFrame(dir, label), label.index * FPS_MS)!;
        if (label.index >= 10) points.push(pose.controlPoints);
      }
      // RMS distance of each published control point from its own mean over the clip.
      let sq = 0;
      let n = 0;
      for (let k = 0; k < 4; k++) {
        const mx = points.reduce((a, p) => a + p[k]!.x, 0) / points.length;
        const my = points.reduce((a, p) => a + p[k]!.y, 0) / points.length;
        for (const p of points) {
          sq += (p[k]!.x - mx) ** 2 + (p[k]!.y - my) ** 2;
          n++;
        }
      }
      const truth = controlPointsPx(labels[0]!.H!, model);
      const bias = Math.max(
        ...truth.map((t, k) => {
          const last = points[points.length - 1]![k]!;
          return Math.hypot(last.x - t.x, last.y - t.y);
        }),
      );
      return { rmsPx: Math.sqrt(sq / n), biasPx: bias };
    });
    const rms = Math.sqrt(perClip.reduce((a, c) => a + c.rmsPx ** 2, 0) / perClip.length);
    results.G34 = {
      gate: 'published control points jitter ≤ 0.7 px RMS on static clips',
      clips: dirs.length,
      jitterRmsPx: Number(rms.toFixed(3)),
      worstClipRmsPx: Number(Math.max(...perClip.map((c) => c.rmsPx)).toFixed(3)),
      medianBiasPx: Number(median(perClip.map((c) => c.biasPx)).toFixed(2)),
    };
    save();
    expect(perClip.length).toBe(12);
  }, 3_600_000);
});

const MODEL = resolve(ROOT, 'app/public/models/necknet-v1');

describe('G4.3: automatic lock, end to end', () => {
  it.skipIf(!existsSync(`${MODEL}.bin`))(
    'detect → snap → index check on held-out frames; false locks on scenes without a guitar',
    () => {
      const bin = readFileSync(`${MODEL}.bin`);
      const net = Network.fromBuffers(
        JSON.parse(readFileSync(`${MODEL}.json`, 'utf8')) as Manifest,
        bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength),
      );
      const trackers = new Map<string, EdgeTracker>();
      const attempt = (dir: string, label: ReturnType<typeof readLabels>[number]) => {
        const model = modelFor(label);
        if (!trackers.has(model.id)) trackers.set(model.id, new EdgeTracker(model));
        const image = readFrame(dir, label);
        const locker = new AutoLocker(trackers.get(model.id)!, (img) => detectNeck(net, img));
        const started = performance.now();
        const status = locker.update(image, 0);
        return { status, ms: performance.now() - started };
      };
      const dir = ensureFrames('g32', ['frames', '--count', '200', '--seed', '32']);
      let found = 0;
      let correct = 0;
      let wrongIndex = 0;
      const ms: number[] = [];
      const labels = readLabels(dir);
      for (const label of labels) {
        const { status, ms: t } = attempt(dir, label);
        ms.push(t);
        if (status.state !== 'verifying' || !status.H) continue;
        found++;
        const e = trackingError(status.H, label.H!, modelFor(label));
        if (isSuccess(e)) correct++;
        else if (e.along > 0.75) wrongIndex++;
      }
      const negDir = ensureFrames('g43-neg', [
        'frames',
        '--count',
        '200',
        '--seed',
        '43',
        '--no-guitar',
      ]);
      let falseLocks = 0;
      const negatives = readLabels(negDir);
      for (const label of negatives)
        if (attempt(negDir, label).status.state !== 'searching') falseLocks++;
      results.G43 = {
        gate: '≥ 95 % correct, ≤ 1 % wrong index, ≤ 0.5 % false lock without a guitar (single-frame proxy)',
        frames: labels.length,
        locked: Number((found / labels.length).toFixed(3)),
        correct: Number((correct / labels.length).toFixed(3)),
        wrongIndex: Number((wrongIndex / labels.length).toFixed(3)),
        negatives: negatives.length,
        falseLock: Number((falseLocks / negatives.length).toFixed(3)),
        msPerAttempt: Number(median(ms).toFixed(0)),
      };
      save();
      expect(labels.length).toBe(200);
    },
    3_600_000,
  );
});
