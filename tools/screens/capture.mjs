// Screenshot helper for visual review: `node tools/screens/capture.mjs <outDir> <spec.json>`
// spec: [{ name, path, width, height, theme, settings?, actions?: [{ click | fill | press | wait }] }]
// Expects the production build served on http://localhost:4173 (npm run preview).
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(resolve(root, 'app/package.json'));
const { chromium } = require('@playwright/test');

const [outDir, specFile] = process.argv.slice(2);
if (!outDir || !specFile) {
  console.error('usage: node tools/screens/capture.mjs <outDir> <spec.json>');
  process.exit(1);
}
const shots = JSON.parse(readFileSync(specFile, 'utf8'));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
// Shots with `fakeAudio` (a file in fixtures/generated) get a browser whose microphone plays it.
const fakeBrowsers = new Map();
async function browserFor(shot) {
  if (!shot.fakeAudio) return browser;
  if (!fakeBrowsers.has(shot.fakeAudio)) {
    const dir = resolve(root, 'fixtures/generated');
    fakeBrowsers.set(
      shot.fakeAudio,
      await chromium.launch({
        args: [
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          `--use-file-for-fake-video-capture=${dir}/bars-720p.mjpeg`,
          `--use-file-for-fake-audio-capture=${dir}/${shot.fakeAudio}`,
        ],
      }),
    );
  }
  return fakeBrowsers.get(shot.fakeAudio);
}
const errors = [];
try {
  for (const shot of shots) {
    const context = await (
      await browserFor(shot)
    ).newContext({
      viewport: { width: shot.width ?? 1440, height: shot.height ?? 900 },
      deviceScaleFactor: shot.scale ?? 1,
      ...(shot.fakeAudio ? { permissions: ['microphone'] } : {}),
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${shot.name}: ${e.message}`));
    const settings = { onboarded: true, theme: shot.theme ?? 'dark', ...(shot.settings ?? {}) };
    await page.addInitScript(
      (value) => {
        if (!sessionStorage.getItem('__seeded')) {
          localStorage.setItem('fretlume.settings', value);
          sessionStorage.setItem('__seeded', '1');
        }
      },
      JSON.stringify({ state: settings, version: 1 }),
    );
    await page.goto(`http://localhost:4173/${shot.path ?? ''}`);
    await page.evaluate(() => globalThis.document.fonts.ready);
    for (const action of shot.actions ?? []) {
      if (action.click)
        await page
          .getByRole(action.role ?? 'button', { name: action.click })
          .first()
          .click();
      if (action.clickSelector) await page.locator(action.clickSelector).first().click();
      if (action.fill) await page.locator(action.fill).fill(action.value);
      if (action.press) await page.keyboard.press(action.press);
      if (action.wait) await page.waitForTimeout(action.wait);
    }
    // Let the "ready offline" toast clear unless asked not to.
    await page.waitForTimeout(shot.settle ?? 4300);
    await page.screenshot({ path: resolve(outDir, `${shot.name}.png`), fullPage: !!shot.fullPage });
    await context.close();
    console.log(`captured ${shot.name}`);
  }
} finally {
  await browser.close();
  for (const b of fakeBrowsers.values()) await b.close();
}
if (errors.length) {
  console.error('page errors:\n' + errors.join('\n'));
  process.exitCode = 1;
}
