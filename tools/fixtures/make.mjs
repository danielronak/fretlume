// `npm run fixtures` — (re)generates the media fixtures used by the e2e tests into fixtures/generated/.
// Everything here is deterministic, so the files are not committed.
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { floatsToWav, sineTone, testPatternToMjpeg } from './lib.mjs';

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

for (const fixture of fixtures) {
  const out = resolve(outDir, fixture.file);
  if (!force && existsSync(out) && statSync(out).size > 0) {
    console.log(`kept   ${fixture.file}`);
    continue;
  }
  fixture.make(out);
  console.log(`wrote  ${fixture.file} — ${fixture.describe} (${statSync(out).size} bytes)`);
}
