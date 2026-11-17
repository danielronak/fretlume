// Stage screenshots on the synthetic camera clips: `node tools/screens/stage.mjs <outDir> [nameRegex]`.
/* global document, window -- page.evaluate callbacks run in the browser */
// Expects the production build on http://localhost:4173 and `npm run fixtures` done. For each clip it
// locks with taps at the labelled corners of the frozen frame, then captures the confirmation and
// the live overlay.
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(resolve(root, 'app/package.json'));
const { chromium } = require('@playwright/test');
const G = resolve(root, 'fixtures/generated');
const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: node tools/screens/stage.mjs <outDir>');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
const shots = process.env.AUTO
  ? [
      { clip: 'lock-easy', item: 'chord/C/maj', auto: true, name: 'auto-easy' },
      { clip: 'lock-hard', item: 'chord/G/maj', auto: true, name: 'auto-hard' },
      { clip: 'lefty', item: 'chord/D/min', auto: true, guitar: 'electric', name: 'auto-lefty' },
      { clip: 'low-light', item: 'scale/A/minor-pentatonic', auto: true, name: 'auto-low-light' },
      {
        clip: 'no-guitar',
        item: 'chord/C/maj',
        auto: true,
        name: 'auto-no-guitar',
        searchOnly: true,
      },
      {
        clip: 'lock-hard',
        item: 'chord/E/min',
        auto: true,
        name: 'auto-phone',
        viewport: [844, 390],
      },
    ]
  : [
      { clip: 'lock-easy', item: 'chord/C/maj', next: 0, confirm: true },
      { clip: 'lock-easy', item: 'chord/C/maj', next: 2, settings: { labelMode: 'fingers' } },
      { clip: 'track-hand', item: 'chord/G/maj', next: 6, still: 30 },
      { clip: 'track-motion', item: 'scale/A/minor-pentatonic', next: 0, still: 30, wait: 3500 },
      { clip: 'track-motion', item: 'scale/A/minor-pentatonic', next: 2, still: 30, wait: 1500 },
      { clip: 'lefty', item: 'chord/D/min', next: 5, guitar: 'electric', confirm: true },
      { clip: 'capo', item: 'chord/C/maj', next: 6, confirm: true },
      { clip: 'low-light', item: 'chord/E/min', next: 0 },
      { clip: 'lock-easy', item: 'triad/G/maj', next: 0, theme: 'light' },
      {
        clip: 'lock-easy',
        item: 'key/D/major',
        next: 1,
        settings: { labelMode: 'intervals', dotScale: 1.4 },
      },
      {
        clip: 'track-hand',
        item: 'chord/A/m7',
        next: 0,
        still: 30,
        viewport: [844, 390],
        name: 'phone',
      },
      { clip: 'lock-easy', item: 'chord/C/maj', next: 0, marking: true },
    ];

const errors = [];
for (const [n, shot] of shots.entries()) {
  if (only && !only.test(shot.name ?? shot.clip)) continue;
  const labels = readFileSync(`${G}/clip-${shot.clip}.labels.jsonl`, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  const browser = await chromium.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${G}/clip-${shot.clip}.mjpeg`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const [w, h] = shot.viewport ?? [1440, 900];
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    permissions: ['camera'],
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${shot.clip}: ${e.message}`));
  const settings = {
    onboarded: true,
    autoLock: !!shot.auto,
    theme: shot.theme ?? 'dark',
    guitar: shot.guitar ?? 'steel-acoustic',
    ...(shot.settings ?? {}),
  };
  await page.addInitScript((s) => {
    localStorage.setItem('fretlume.settings', JSON.stringify({ state: s, version: 1 }));
    localStorage.setItem('fretlume.debug', '1');
  }, settings);
  await page.goto(`http://localhost:4173/#/stage/${shot.item}`);
  await page.getByRole('button', { name: 'Start camera' }).first().click();
  await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
  // The first-load "ready offline" notice would cover the video.
  await page.waitForTimeout(300);
  for (const close of await page.locator('.toast button').all())
    await close.click().catch(() => {});
  if (shot.auto) {
    const name = `${String(n + 1).padStart(2, '0')}-${shot.name}`;
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${outDir}/${name}-searching.png` });
    if (shot.searchOnly) {
      await page.waitForTimeout(6000);
      await page.screenshot({ path: `${outDir}/${name}-still-searching.png` });
      await browser.close();
      console.log('saved', name);
      continue;
    }
    await page.getByTestId('stage-confirm').waitFor({ timeout: 45000 });
    await page.evaluate(() =>
      document.querySelector('.stage__box')?.scrollIntoView({ block: 'start' }),
    );
    await page.screenshot({ path: `${outDir}/${name}-confirm.png` });
    await page.getByTestId('stage-confirm').click();
    await page.waitForTimeout(1500);
    await page.evaluate(() =>
      document.querySelector('.stage__box')?.scrollIntoView({ block: 'start' }),
    );
    await page.screenshot({ path: `${outDir}/${name}-overlay.png` });
    await browser.close();
    console.log('saved', name);
    continue;
  }
  for (let i = 0; i < shot.next; i++) await page.getByTestId('deck-next').click();
  let frozen = 0;
  for (let attempt = 0; attempt < 40; attempt++) {
    await page.getByTestId('stage-lock').click();
    await page.waitForSelector('[data-testid=lock-handle-1]');
    frozen = await page.evaluate(() => window.__fretlumeStage?.frozenStamp ?? 0);
    if (frozen < (shot.still ?? Infinity)) break;
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(250);
  }
  const label = labels.find((l) => l.index === frozen) ?? labels[0];
  const box = await page.locator('.stage__box').boundingBox();
  const scale = box.width / 1280;
  for (let i = 0; i < 4; i++) {
    const [x, y] = label.control_points[i];
    const hb = await page.getByTestId(`lock-handle-${i + 1}`).boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + (1280 - x) * scale, box.y + y * scale, { steps: 4 });
    await page.mouse.up();
  }
  const name = `${String(n + 1).padStart(2, '0')}-${shot.name ?? shot.clip}-${shot.item.replaceAll('/', '-')}`;
  if (shot.marking) {
    await page.getByTestId('lock-handle-3').focus();
    await page.screenshot({ path: `${outDir}/${name}-marking.png` });
    await browser.close();
    continue;
  }
  await page.getByTestId('stage-snap').click();
  await page.getByTestId('stage-confirm').waitFor({ timeout: 30000 });
  if (shot.confirm) await page.screenshot({ path: `${outDir}/${name}-confirm.png` });
  await page.getByTestId('stage-confirm').click();
  await page.waitForTimeout(shot.wait ?? 1500);
  await page.evaluate(() =>
    document.querySelector('.stage__box')?.scrollIntoView({ block: 'start' }),
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${outDir}/${name}-overlay.png` });
  await browser.close();
  console.log('saved', name);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
