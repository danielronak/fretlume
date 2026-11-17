// `npm run fixtures` — (re)generates the media fixtures used by the e2e tests into fixtures/generated/.
// Everything here is deterministic, so the files are not committed.
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { floatsToWav, pluckTone, sineTone, testPatternToMjpeg } from './lib.mjs';

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

for (const fixture of fixtures) {
  const out = resolve(outDir, fixture.file);
  if (!force && existsSync(out) && statSync(out).size > 0) {
    console.log(`kept   ${fixture.file}`);
    continue;
  }
  fixture.make(out);
  console.log(`wrote  ${fixture.file} — ${fixture.describe} (${statSync(out).size} bytes)`);
}
