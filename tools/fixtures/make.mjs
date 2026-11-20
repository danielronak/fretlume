// `npm run fixtures` — (re)generates the media fixtures used by the e2e tests into fixtures/generated/.
// Everything here is deterministic, so the files are not committed.
import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

// Tab import (phase 5 task 5.6): a Guitar Pro 7 file of our own riff, written by alphaTab's exporter.
fixtures.push({
  file: 'riff.gp',
  describe: 'Guitar Pro 7 riff with hammer-on, slide, bend and a chord name (tab import)',
  make: async (out) => {
    const alphaTab = await import('@coderline/alphatab/core');
    const settings = new alphaTab.Settings();
    const importer = new alphaTab.importer.AlphaTexImporter();
    importer.initFromString(
      '\\title "GP Riff" \\tempo 112 \\ts (4 4) ' +
        '5.3.4 {ch "Am"} 5.4{h}.8 7.4.8 7.4{sl}.4 9.4.4 | 8.2{b (0 4)}.4 x.6.8 5.5{pm}.8 5.1{v}.2',
      settings,
    );
    writeFileSync(out, new alphaTab.exporter.Gp7Exporter().export(importer.readScore(), settings));
  },
});

// Listening (phase 6 task 6.7): scripted players through the fake microphone. Open G (320003) strummed
// every 2.5 s, 30 ms per string: perfect, with string 4 (D3) muted, with string 5 a fret low; and a
// string-by-string pass with string 4 muted.
const OPEN = [64, 59, 55, 50, 45, 40];
const G_FRETS = [3, 0, 0, 0, 2, 3]; // string 1 … 6
function player({ mute = 0, shift = null, mode = 'strum' } = {}) {
  const sr = 48000;
  const total = mode === 'strum+check' ? 13 : mode === 'notes' ? 4.2 : 10;
  const out = new Float32Array(total * sr);
  const add = (midi, t, seed) => {
    // Ring until the end of the file (an abrupt stop would itself look like an onset).
    const y = pluckTone(440 * 2 ** ((midi - 69) / 12), total - t, sr, { amplitude: 0.22, seed, decayScale: 0.25 });
    const s0 = Math.round(t * sr);
    for (let i = 0; i < y.length && s0 + i < out.length; i++) out[s0 + i] += y[i];
  };
  const strings = [6, 5, 4, 3, 2, 1];
  const thud = (t) => {
    // A muted string picked: a short dead click, no pitch.
    const s0 = Math.round(t * sr);
    let seed = 99;
    for (let i = 0; i < sr * 0.03 && s0 + i < out.length; i++) {
      seed = (seed * 16807) % 2147483647;
      out[s0 + i] += 0.08 * ((seed / 2147483647) * 2 - 1) * Math.exp(-i / (sr * 0.004));
    }
  };
  if (mode === 'notes') {
    [64, 67, 69].forEach((midi, j) => add(midi, 0.5 + j * 1.2, 80 + j));
  } else if (mode === 'strum+check') {
    // Two strums, then each string on its own (the muted one gives a dead click).
    for (let k = 0; k < 2; k++)
      strings.forEach((s, j) => {
        if (s !== mute) add(OPEN[s - 1] + G_FRETS[s - 1], 0.4 + k * 2.5 + j * 0.03, 10 * k + s);
      });
    strings.forEach((s, j) => {
      const t = 5.5 + j * 1.2;
      if (s === mute) thud(t);
      else add(OPEN[s - 1] + G_FRETS[s - 1], t, 70 + s);
    });
  } else if (mode === 'strum') {
    for (let k = 0; k < 4; k++)
      strings.forEach((s, j) => {
        if (s === mute) return;
        const fret = G_FRETS[s - 1] + (shift && shift.string === s ? shift.by : 0);
        add(OPEN[s - 1] + fret, 0.4 + k * 2.5 + j * 0.03, 10 * k + s);
      });
  } else {
    strings.forEach((s, j) => {
      if (s !== mute) add(OPEN[s - 1] + G_FRETS[s - 1], 0.6 + j * 1.4, 50 + s);
    });
  }
  return out;
}
for (const [file, describe, opts] of [
  ['player-e-g-a.wav', 'E4, G4, A4 on the high e string, 1.2 s apart (tab play-along player)', { mode: 'notes' }],
  ['player-g-perfect.wav', 'open G strummed cleanly every 2.5 s (scripted player)', {}],
  ['player-g-muted4.wav', 'open G with string 4 muted: two strums, then string by string (scripted player)', { mute: 4, mode: 'strum+check' }],
  ['player-g-wrong5.wav', 'open G with the string-5 finger a fret low (scripted player)', { shift: { string: 5, by: -1 } }],
  ['player-g-sbs-muted4.wav', 'open G string by string, string 4 silent (scripted player)', { mute: 4, mode: 'sbs' }],
])
  fixtures.push({ file, describe, make: (out) => floatsToWav(player(opts), 48000, out) });

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
  // Auto-lock (phase 4): any board, wider framing, a hand on the neck, gentle sway.
  ['lock-hard', 18, ['--kind', 'random', '--frames', '60', '--pingpong', '--max-speed', '1.5']],
];
for (const [kind, seed, extra] of CLIPS) {
  fixtures.push({
    file: `clip-${kind}.mjpeg`,
    describe: `synthetic ${kind} clip, 1280x720, 30 fps, stamped, with labels`,
    make: (out) => {
      const dir = mkdtempSync(resolve(tmpdir(), `fretlume-${kind}-`));
      const result = spawnSync(
        'uv',
        ['run', '--project', mlDir, 'python', '-m', 'synth.cli', 'clip', ...(extra.includes('--kind') ? [] : ['--kind', kind]),
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
  await fixture.make(out);
  console.log(`wrote  ${fixture.file} — ${fixture.describe} (${statSync(out).size} bytes)`);
}
