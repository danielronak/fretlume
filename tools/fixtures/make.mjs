// `npm run fixtures` — (re)generates the media fixtures used by the e2e tests into fixtures/generated/.
// Everything here is deterministic, so the files are not committed.
import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { floatsToWav, pngSequenceToMjpeg, pluckTone, sineTone, testPatternToMjpeg } from './lib.mjs';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/generated');
const force = process.argv.includes('--force');

const fixtures = [
  {
    file: 'bars-720p.mjpeg',
    describe: '1280x720 test pattern, 1 s at 30 fps (fake camera)',
    make: (out) => testPatternToMjpeg(out, { width: 1280, height: 720, fps: 30, seconds: 1 }),
  },
  {
    file: 'tone-110hz.wav',
    describe: '110 Hz sine (the open A string), 2 s at 48 kHz (fake microphone)',
    make: (out) => floatsToWav(sineTone(110, 2, 48000), 48000, out),
  },
];

// Tuner gate G6.1: each open string of standard tuning at -20, 0 and +20 cents, as a 2 s pluck
// that the fake microphone loops (so it is re-plucked every 2 s).
const OPEN_STRINGS = [
  ['E2', 82.4069],
  ['A2', 110],
  ['D3', 146.8324],
  ['G3', 195.9977],
  ['B3', 246.9417],
  ['E4', 329.6276],
];
for (const [name, fHz] of OPEN_STRINGS) {
  for (const offset of [-20, 0, 20]) {
    const label = offset === 0 ? '0' : offset > 0 ? `+${offset}` : String(offset);
    fixtures.push({
      file: `tuner-${name}-${label}c.wav`,
      describe: `${name} plucked at ${label} cents, 2 s at 48 kHz`,
      make: (out) => floatsToWav(pluckTone(fHz * 2 ** (offset / 1200), 2, 48000, { seed: Math.round(fHz) }), 48000, out),
    });
  }
}

// Camera clips (phase 3 task 3.10): synthetic guitar footage with the frame number stamped in the
// corner and exact labels (clip-<kind>.labels.jsonl). 3 s at 30 fps; Chromium loops the file.
const mlDir = resolve(outDir, '../../ml');
// Moving clips hold still for 2.5 s (the player locking), then move and come back (ping-pong), so the
// looping fake camera never jumps. They move at most 3 px per frame (90 px/s): the container
// processes ~10 frames/s; faster motion is covered by the G3.3 benchmark, which sees every frame. The capo clip uses a rosewood board so it tests the capo; light
// boards are covered by the benchmarks (DECISIONS D-016).
const HOLD = ['--hold', '75', '--pingpong', '--max-speed', '3'];
const CLIPS = [
  ['lock-easy', 11, ['--frames', '90']],
  ['track-hand', 12, ['--frames', '60', ...HOLD]],
  ['track-motion', 13, ['--frames', '60', ...HOLD]],
  ['lefty', 14, ['--frames', '90', '--instrument', 'electric']],
  ['capo', 15, ['--frames', '90', '--board', 'rosewood']],
  ['low-light', 16, ['--frames', '90']],
  ['no-guitar', 17, ['--frames', '90']],
];
for (const [kind, seed, extra] of CLIPS) {
  fixtures.push({
    file: `clip-${kind}.mjpeg`,
    describe: `synthetic ${kind} clip, 1280x720, 30 fps, stamped, with labels`,
    make: (out) => {
      const dir = mkdtempSync(resolve(tmpdir(), `fretlume-${kind}-`));
      const result = spawnSync(
        'uv',
        ['run', '--project', mlDir, 'python', '-m', 'synth.cli', 'clip', '--kind', kind,
          '--seed', String(seed), '--format', 'png', '--stamp', '--out', dir, ...extra],
        { cwd: mlDir, stdio: 'inherit' },
      );
      if (result.status !== 0) throw new Error(`clip ${kind} failed`);
      pngSequenceToMjpeg(resolve(dir, '%06d.png'), out, { quality: 2 });
      copyFileSync(resolve(dir, 'labels.jsonl'), out.replace(/\.mjpeg$/, '.labels.jsonl'));
      rmSync(dir, { recursive: true, force: true });
    },
  });
}

for (const fixture of fixtures) {
  const out = resolve(outDir, fixture.file);
  if (!force && existsSync(out) && statSync(out).size > 0) {
    console.log(`kept   ${fixture.file}`);
    continue;
  }
  fixture.make(out);
  console.log(`wrote  ${fixture.file} — ${fixture.describe} (${statSync(out).size} bytes)`);
}
