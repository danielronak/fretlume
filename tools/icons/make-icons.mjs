// Rasterises app/public/icons/mark.svg into the PNG icons the web manifest needs.
// Uses the Chromium that Playwright already provides; run with `npm run icons`.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(resolve(root, 'app/package.json'));
const { chromium } = require('@playwright/test');

const iconsDir = resolve(root, 'app/public/icons');
const svg = await readFile(resolve(iconsDir, 'mark.svg'), 'utf8');

// [file, size, padding fraction, square background]
const targets = [
  ['icon-192.png', 192, 0, false],
  ['icon-512.png', 512, 0, false],
  ['apple-touch-icon.png', 180, 0, true],
  // Maskable icons are cropped to a circle or squircle: keep the mark inside the safe zone.
  ['icon-maskable-512.png', 512, 0.1, true],
];

const browser = await chromium.launch();
try {
  for (const [file, size, pad, square] of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const inner = Math.round(size * (1 - 2 * pad));
    await page.setContent(
      `<body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;` +
        `background:${square ? '#141210' : 'transparent'}">` +
        `<div style="width:${inner}px;height:${inner}px">${svg}</div></body>`,
    );
    await page.screenshot({ path: resolve(iconsDir, file), omitBackground: !square });
    await page.close();
    console.log(`wrote ${file} (${size}px)`);
  }
} finally {
  await browser.close();
}
