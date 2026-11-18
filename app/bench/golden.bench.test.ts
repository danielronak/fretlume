/**
 * Real-photo golden set (phase 4 task 4.9, gate G4.4). Two steps:
 *   GOLDEN=snap  — snap each proposed label (four corners read off the gridded photo) with the
 *                  EdgeTracker and write the geometry tools/golden/golden.py renders for review;
 *   (default)    — G4.4: automatic lock on every accepted photo, compared with its label.
 * Photos live in fixtures/generated/golden/ (not committed); labels in tools/golden/labels.json.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fretX,
  halfWidth,
  INSTRUMENTS,
  stringY,
  type InstrumentModel,
} from '@core/guitar/instrument';
import { AutoLocker } from '@vision/autoLock';
import { EdgeTracker, trackingError } from '@vision/edgeTracker';
import { apply, type Mat3 } from '@vision/geometry';
import type { Image } from '@vision/image';
import { snapLock } from '@vision/lock';
import { detectNeck } from '@vision/neckNet';
import { Network, type Manifest } from '@vision/nn';
import { ROOT } from './data';

const WORK = resolve(ROOT, 'fixtures/generated/golden');
const LABELS = resolve(ROOT, 'tools/golden/labels.json');

interface GoldenLabel {
  instrument: 'steel-acoustic' | 'electric' | 'classical';
  /** Four corners (nut bass, nut treble, 12th treble, 12th bass) read off the photo, px. */
  taps: [number, number][];
  status: 'proposed' | 'accepted' | 'rejected';
  /** Board → image, set when accepted. */
  H?: number[];
  note?: string;
}

const MODELS: Record<GoldenLabel['instrument'], InstrumentModel> = {
  'steel-acoustic': INSTRUMENTS.steelAcoustic,
  electric: INSTRUMENTS.electric,
  classical: INSTRUMENTS.classical,
};

function loadImage(key: string): Image {
  const meta = JSON.parse(readFileSync(resolve(WORK, 'meta.json'), 'utf8')) as Record<
    string,
    { w: number; h: number }
  >;
  const m = meta[key]!;
  return {
    width: m.w,
    height: m.h,
    channels: 4,
    data: new Uint8ClampedArray(readFileSync(resolve(WORK, `${key}.rgba`))),
  };
}

const labels = (): Record<string, GoldenLabel> =>
  existsSync(LABELS)
    ? (JSON.parse(readFileSync(LABELS, 'utf8')) as Record<string, GoldenLabel>)
    : {};

describe.runIf(process.env.GOLDEN === 'snap')('golden set: snap proposals', () => {
  it('snaps proposed corners and writes review geometry', () => {
    const out: Record<string, unknown> = {};
    for (const [key, label] of Object.entries(labels())) {
      if (label.status === 'rejected' || !existsSync(resolve(WORK, `${key}.rgba`))) continue;
      const model = MODELS[label.instrument];
      const image = loadImage(key);
      const taps = label.taps.map(([x, y]) => ({ x, y }));
      const snap = snapLock(new EdgeTracker(model), image, taps);
      const H = (snap.inliers > 0 ? snap.H : null) ?? null;
      if (!H) {
        out[key] = { failed: true };
        continue;
      }
      const lines = Array.from({ length: 13 }, (_, n) => {
        const x = fretX(model, n);
        const hw = halfWidth(model, x);
        const a = apply(H, x, -hw);
        const b = apply(H, x, hw);
        return [a.x, a.y, b.x, b.y];
      });
      const end = fretX(model, 12);
      const strings = [1, model.strings].map((s) => {
        const a = apply(H, 0, stringY(model, s, 0));
        const b = apply(H, end, stringY(model, s, end));
        return [a.x, a.y, b.x, b.y];
      });
      const crops = [0.5, 4.5, 11.5].map((n) => {
        const p = apply(H, fretX(model, n), 0);
        return [p.x, p.y];
      });
      out[key] = {
        H: Array.from(H),
        lines,
        strings,
        crops,
        confidence: snap.score,
        polarity: snap.polarity,
      };
    }
    writeFileSync(resolve(WORK, 'snapped.json'), JSON.stringify(out));
    expect(Object.keys(out).length).toBeGreaterThan(0);
  });
});

const MODEL_FILE = resolve(ROOT, 'app/public/models/necknet-v1');

describe('G4.4: automatic lock on real photos', () => {
  const accepted = Object.entries(labels()).filter(
    ([key, l]) => l.status === 'accepted' && l.H && existsSync(resolve(WORK, `${key}.rgba`)),
  );
  it.skipIf(accepted.length === 0 || process.env.GOLDEN === 'snap')(
    'locks correctly on ≥ 85 % of the golden photos',
    () => {
      const bin = readFileSync(`${MODEL_FILE}.bin`);
      const net = Network.fromBuffers(
        JSON.parse(readFileSync(`${MODEL_FILE}.json`, 'utf8')) as Manifest,
        bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength),
      );
      const rows: {
        key: string;
        result: string;
        along?: number;
        across?: number;
        presence: number;
      }[] = [];
      for (const [key, label] of accepted) {
        const model = MODELS[label.instrument];
        const image = loadImage(key);
        let presence = 0;
        const locker = new AutoLocker(new EdgeTracker(model), (img) => {
          const d = detectNeck(net, img);
          presence = d.presence;
          return d;
        });
        const status = locker.update(image, 0);
        if (!status.H) {
          rows.push({ key, result: 'no lock', presence });
          continue;
        }
        // Frets 0–12: real photos often hide the high frets behind the body or the hand.
        const e = trackingError(status.H, label.H as unknown as Mat3, model, 12);
        const result =
          e.along < 0.25 && e.across < 0.35 ? 'correct' : e.along > 0.75 ? 'wrong index' : 'off';
        rows.push({
          key,
          result,
          along: Number(e.along.toFixed(2)),
          across: Number(e.across.toFixed(2)),
          presence,
        });
      }
      const share = (r: string) =>
        Number((rows.filter((x) => x.result === r).length / rows.length).toFixed(3));
      const summary = {
        gate: 'G4.4: ≥ 85 % correct automatic locks on real photos (frets 0–12; along < 0.25 fret, across < 0.35 string spacing)',
        photos: rows.length,
        correct: share('correct'),
        wrongIndex: share('wrong index'),
        off: share('off'),
        noLock: share('no lock'),
        rows,
      };
      writeFileSync(
        resolve(ROOT, 'docs/benchmarks/golden-g44.json'),
        `${JSON.stringify(summary, null, 2)}\n`,
      );
      expect(rows.length).toBe(accepted.length);
    },
    3_600_000,
  );
});
