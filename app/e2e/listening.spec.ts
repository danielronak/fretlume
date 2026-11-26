/**
 * Listening (phase 6, exit gate): scripted players through the fake microphone on the Stage deck.
 * The perfect player passes and wait-mode moves on; a muted string and a finger a fret low are named;
 * the string-by-string check finds the muted string; with the microphone blocked the deck still works.
 */
import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';

async function openG(page: Page) {
  await page.goto('/#/stage/chord/G/maj');
  await page.getByRole('button', { name: 'Use without camera' }).click();
  // Step through the deck to the open G voicing.
  for (let i = 0; i < 12; i++) {
    if ((await page.getByTestId('stage-entry').textContent())?.includes('320003')) break;
    await page.getByTestId('deck-next').click();
  }
  await expect(page.getByTestId('stage-entry')).toContainText('320003');
}

const coach = (page: Page) => page.getByTestId('listen-coach');

test.describe('listening: perfect player', () => {
  test.use({ fakeMedia: { video: 'bars-720p.mjpeg', audio: 'player-g-perfect.wav' } });

  test('a clean G is heard; wait-mode moves on @smoke', async ({ mediaPage: page }) => {
    await openG(page);
    await page.getByRole('switch', { name: 'Listen' }).click();
    await expect(coach(page)).toContainText(/Clean|clean in a row|Sounded close/, {
      timeout: 15_000,
    });
    await expect(page.locator('[data-testid="judged-good"]').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/listen-clean.png' });
    await page.getByRole('switch', { name: 'Wait for me' }).click();
    await expect(page.getByTestId('stage-entry')).not.toContainText('320003', { timeout: 15_000 });
  });
});

test.describe('listening: CAGED shape card', () => {
  test.use({ fakeMedia: { video: 'bars-720p.mjpeg', audio: 'player-g-perfect.wav' } });

  test('the highlighted shape is judged while the others show dimmed (field test 2026-11-26)', async ({
    mediaPage: page,
  }) => {
    await page.goto('/#/stage/chord/G/maj');
    await page.getByRole('button', { name: 'Use without camera' }).click();
    await page.getByTestId('deck-next').click();
    await expect(page.getByTestId('stage-entry')).toHaveText('G shape');
    await expect(page.getByRole('switch', { name: 'All shapes' })).toBeChecked();
    await page.getByRole('switch', { name: 'Listen' }).click();
    await expect(coach(page)).toContainText(/Clean|clean in a row|Sounded close/, {
      timeout: 15_000,
    });
  });
});

test.describe('listening: muted string', () => {
  test.use({ fakeMedia: { video: 'bars-720p.mjpeg', audio: 'player-g-muted4.wav' } });

  test('names string 4 and the string-by-string check finds it', async ({ mediaPage: page }) => {
    await openG(page);
    await page.getByRole('switch', { name: 'Listen' }).click();
    await expect(coach(page)).toContainText('String 4', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Check string by string' }).first().click();
    const check = page.getByTestId('listen-check');
    await expect(check).toContainText('String 4 does not ring clearly', { timeout: 30_000 });
    await expect(check).toContainText('String 6 rings');
    await expect(check).toContainText('String 5 rings');
    await page.screenshot({ path: 'test-results/listen-check.png' });
    // The escape hatch always moves on, even in wait-mode with a chord that keeps failing.
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('switch', { name: 'Wait for me' }).click();
    await page.getByTestId('listen-mark-played').click();
    await expect(page.getByTestId('stage-entry')).not.toContainText('320003');
  });
});

test.describe('listening: finger a fret low', () => {
  test.use({ fakeMedia: { video: 'bars-720p.mjpeg', audio: 'player-g-wrong5.wav' } });

  test('names string 5 as a fret too low', async ({ mediaPage: page }) => {
    await openG(page);
    await page.getByRole('switch', { name: 'Listen' }).click();
    await expect(coach(page)).toContainText('String 5: sounds like A#, a fret too low', {
      timeout: 15_000,
    });
  });
});

test.describe('listening: microphone blocked', () => {
  test.use({ fakeMedia: { video: 'bars-720p.mjpeg', audio: 'player-g-perfect.wav' } });

  test('explains it and the deck keeps working @smoke', async ({ mediaPage: page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });
    await openG(page);
    await page.getByRole('switch', { name: 'Listen' }).click();
    await expect(page.getByTestId('listen-panel').getByRole('alert')).toContainText(
      'Microphone access is blocked',
    );
    await page.getByTestId('deck-next').click();
    await expect(page.getByTestId('stage-entry')).not.toContainText('320003');
  });
});

test.describe('listening: tab play-along, wait for me', () => {
  test.use({ fakeMedia: { video: 'bars-720p.mjpeg', audio: 'player-e-g-a.wav' } });

  test('each note of the tab waits until it is played right', async ({ mediaPage: page }) => {
    await page.goto('/#/tabs');
    await page.getByTestId('tabs-paste').click();
    await page
      .getByTestId('tabs-paste-text')
      .fill(
        [
          'e|-0---3---5---|',
          'B|-------------|',
          'G|-------------|',
          'D|-------------|',
          'A|-------------|',
          'E|-------------|',
        ].join('\n'),
      );
    await page.getByTestId('tabs-paste-import').click();
    await page.getByTestId('tab-stage').click();
    await page.getByRole('button', { name: 'Use without camera' }).click();
    await page.getByRole('switch', { name: 'Listen' }).click();
    await page.getByRole('switch', { name: 'Wait for me' }).click();
    await expect(page.getByTestId('tab-listen-score')).toContainText(/[3-9] of [3-9] right/, {
      timeout: 20_000,
    });
    await expect(coach(page)).toContainText(/Clean|in a row/);
    await page.screenshot({ path: 'test-results/listen-tab.png' });
  });
});

test.describe('what am I playing', () => {
  test.use({ fakeMedia: { video: 'bars-720p.mjpeg', audio: 'player-g-perfect.wav' } });

  test('names the strummed G among its guesses', async ({ mediaPage: page }) => {
    await page.goto('/#/tools/what');
    await page.getByRole('button', { name: 'Turn on the microphone' }).click();
    await expect(page.getByTestId('screen-what')).toContainText(/\bG\b/, { timeout: 15_000 });
    await page.screenshot({ path: 'test-results/what.png' });
  });
});
