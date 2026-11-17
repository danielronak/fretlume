import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, test as base, type Page } from '@playwright/test';

const generatedDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/generated');

export interface FakeMedia {
  /** File in fixtures/generated/ played as the camera (.mjpeg or .y4m). */
  video: string;
  /** File in fixtures/generated/ played as the microphone (.wav). Loops. */
  audio: string;
}

interface MediaFixtures {
  fakeMedia: FakeMedia;
  mediaPage: Page;
  /** Settings written to localStorage before the app loads. Default: welcome already done. */
  seedSettings: Record<string, unknown> | null;
}

export const SETTINGS_KEY = 'fretlume.settings';

/** Seed the persisted settings store before any page script runs. */
export async function seed(page: Page, settings: Record<string, unknown> | null) {
  if (!settings) return;
  await page.addInitScript(
    ([key, value]) => {
      // Only on the first load of this test, so the app's own writes survive reloads.
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.setItem(key, value);
        sessionStorage.setItem('__seeded', '1');
      }
    },
    [SETTINGS_KEY, JSON.stringify({ state: settings, version: 1 })] as const,
  );
}

/**
 * `mediaPage` is a page in a dedicated browser whose camera and microphone are fed
 * from files. Chromium takes the files as launch flags, so each choice of files
 * needs its own browser. Choose them per file or per describe block:
 *
 *   test.use({ fakeMedia: { video: 'lock-easy.mjpeg', audio: 'tone-110hz.wav' } });
 */
export const test = base.extend<MediaFixtures>({
  fakeMedia: [{ video: 'bars-720p.mjpeg', audio: 'tone-110hz.wav' }, { option: true }],
  seedSettings: [{ onboarded: true }, { option: true }],

  page: async ({ page, seedSettings }, use) => {
    await seed(page, seedSettings);
    await use(page);
  },

  mediaPage: async ({ fakeMedia, baseURL, viewport, seedSettings }, use) => {
    const video = resolve(generatedDir, fakeMedia.video);
    const audio = resolve(generatedDir, fakeMedia.audio);
    for (const file of [video, audio]) {
      if (!existsSync(file)) throw new Error(`Missing fixture ${file}. Run \`npm run fixtures\`.`);
    }
    const browser = await chromium.launch({
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-video-capture=${video}`,
        `--use-file-for-fake-audio-capture=${audio}`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    });
    const context = await browser.newContext({
      ...(baseURL ? { baseURL } : {}),
      ...(viewport ? { viewport } : {}),
      permissions: ['camera', 'microphone'],
    });
    const page = await context.newPage();
    await seed(page, seedSettings);
    await use(page);
    await browser.close();
  },
});

export { expect } from '@playwright/test';
