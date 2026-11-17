import type { Page } from '@playwright/test';
import { expect, test, type FakeMedia } from './fixtures';

const STRINGS = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] as const;
const OFFSETS = [-20, 0, 20] as const;
const label = (offset: number) => (offset === 0 ? '0' : offset > 0 ? `+${offset}` : String(offset));
const media = (name: string, offset: number): FakeMedia => ({
  video: 'bars-720p.mjpeg',
  audio: `tuner-${name}-${label(offset)}c.wav`,
});

async function readTuner(page: Page) {
  await page.goto('/#/tools/tuner');
  await page.getByRole('button', { name: 'Turn on the microphone' }).click();
  const display = page.getByTestId('tuner-display');
  // Wait for a steady reading, then sample a few to judge accuracy.
  await expect(display).not.toHaveAttribute('data-target', '', { timeout: 10_000 });
  const samples: { target: string; cents: number }[] = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(150);
    const target = (await display.getAttribute('data-target')) ?? '';
    const cents = Number(await display.getAttribute('data-cents'));
    if (target) samples.push({ target, cents });
  }
  return samples;
}

/**
 * Gate G6.1 through the real pipeline: fake microphone → capture worklet → detector → screen.
 * Readings while the looped pluck restarts can be briefly off, so the median is judged.
 */
function checkGate(samples: { target: string; cents: number }[], name: string, offset: number) {
  expect(samples.length).toBeGreaterThanOrEqual(3);
  expect(samples.every((s) => s.target === name)).toBe(true);
  const sorted = samples.map((s) => s.cents).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  expect(Math.abs(median - offset), `median ${median} for ${offset}`).toBeLessThanOrEqual(1);
}

test.describe('tuner @smoke', () => {
  test.describe('A string, 20 cents sharp', () => {
    test.use({ fakeMedia: media('A2', 20) });
    test('reads A2 at +20 cents and says to loosen', async ({ mediaPage: page }) => {
      checkGate(await readTuner(page), 'A2', 20);
      await expect(page.getByTestId('tuner-advice')).toHaveText('Too high: loosen the string.');
    });
  });

  test.describe('low E in tune, one string at a time', () => {
    test.use({ fakeMedia: media('E2', 0), seedSettings: { onboarded: true, tunerGuided: true } });
    test('ticks off the low E and moves to the A string', async ({ mediaPage: page }) => {
      await page.goto('/#/tools/tuner');
      await page.getByRole('button', { name: 'Turn on the microphone' }).click();
      const strings = page.getByRole('list', { name: 'Strings' }).getByRole('listitem');
      await expect(strings.nth(0)).toHaveAttribute('data-tuned', 'true', { timeout: 10_000 });
      await expect(strings.nth(1)).toHaveAttribute('data-target', 'true', { timeout: 5_000 });
      await expect(page.getByTestId('tuner-advice')).toContainText('Too low');
    });
  });
});

test.describe('tuner gate G6.1: every open string at ±20 cents', () => {
  for (const name of STRINGS) {
    for (const offset of OFFSETS) {
      test.describe(`${name} ${label(offset)} cents`, () => {
        test.use({ fakeMedia: media(name, offset) });
        test(`reads ${name} within 1 cent`, async ({ mediaPage: page }) => {
          checkGate(await readTuner(page), name, offset);
        });
      });
    }
  }
});
