/** Loading synthetic frames written by ml/synth (raw gray + labels.jsonl), generating them on demand. */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTRUMENTS, type InstrumentModel } from '@core/guitar/instrument';
import type { Mat3 } from '@vision/geometry';
import type { Image } from '@vision/image';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const BENCH_DIR = resolve(ROOT, 'fixtures/generated/bench');

export interface FrameLabel {
  index: number;
  width: number;
  height: number;
  instrument: 'steel-acoustic' | 'electric' | 'classical';
  guitar: boolean;
  H: Mat3 | null;
  control_points: [number, number][] | null;
  polarity: 'bright' | 'dark' | null;
  board: string | null;
  hand: { fret: number; cells: [number, number][] } | null;
}

const MODEL: Record<FrameLabel['instrument'], InstrumentModel> = {
  'steel-acoustic': INSTRUMENTS.steelAcoustic,
  electric: INSTRUMENTS.electric,
  classical: INSTRUMENTS.classical,
};
export const modelFor = (label: FrameLabel) => MODEL[label.instrument];

/** Run the Python generator (uv) — the same command a person would run in ml/. */
export function synth(args: string[]): void {
  const result = spawnSync(
    'uv',
    ['run', '--project', resolve(ROOT, 'ml'), 'python', '-m', ...args],
    {
      cwd: resolve(ROOT, 'ml'),
      encoding: 'utf8',
    },
  );
  if (result.status !== 0) throw new Error(`synth ${args.join(' ')} failed:\n${result.stderr}`);
}

export function ensureFrames(name: string, args: string[]): string {
  const dir = resolve(BENCH_DIR, name);
  if (!existsSync(resolve(dir, 'labels.jsonl')))
    synth(['synth.cli', ...args, '--out', dir, '--format', 'gray']);
  return dir;
}

export function readLabels(dir: string): FrameLabel[] {
  return readFileSync(resolve(dir, 'labels.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const raw = JSON.parse(line) as Omit<FrameLabel, 'H'> & { H: number[][] | null };
      return { ...raw, H: raw.H ? raw.H.flat() : null };
    });
}

export function readFrame(dir: string, label: FrameLabel): Image {
  const data = readFileSync(resolve(dir, `${String(label.index).padStart(6, '0')}.gray`));
  return {
    width: label.width,
    height: label.height,
    data: new Uint8Array(data.buffer, data.byteOffset, data.length),
    channels: 1,
  };
}
