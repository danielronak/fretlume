/**
 * Practice runs (phase 5 task 5.2, parity P-F10; exit gate item 2): build a run of four cards, save
 * it, reload, reopen it, and let it auto-advance on the Stage with the camera on (track-hand clip).
 */
import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';

test.use({
  fakeMedia: { video: 'clip-track-hand.mjpeg', audio: 'tone-110hz.wav' },
  seedSettings: { onboarded: true, guitar: 'steel-acoustic', autoLock: false },
});

async function addCard(page: Page, kind: string, root: string, type: string) {
  await page.getByTestId('run-kind').selectOption(kind);
  await page.getByTestId('run-root').selectOption(root);
  await page.getByTestId('run-type').selectOption(type);
  await page.getByTestId('run-add').click();
}

test('build a run of 4 cards, save, reload, reopen, auto-advance on Stage @smoke', async ({
  mediaPage: page,
}) => {
  await page.goto('/#/library/runs');
  await page.getByTestId('runs-new').click();
  await addCard(page, 'chord', '0', 'maj');
  await addCard(page, 'chord', '7', 'maj');
  await addCard(page, 'scale', '9', 'minor-pentatonic');
  await addCard(page, 'chord', '5', 'maj');
  await expect(page.getByTestId('run-chosen').locator('li')).toHaveCount(4);

  await page.getByTestId('run-next').click();
  // Two seconds per card (the shortest allowed), so the test is quick.
  const amounts = page.getByTestId('run-card-amount');
  await expect(amounts).toHaveCount(4);
  for (let i = 0; i < 4; i++) await amounts.nth(i).fill('2');
  await page.getByTestId('run-next').click();
  await page.getByTestId('run-name').fill('Gate run');
  await page.getByTestId('run-save').click();

  await expect(page.getByTestId('run-item')).toHaveCount(1);
  await page.reload();
  const item = page.getByTestId('run-item');
  await expect(item).toContainText('Gate run');
  await expect(item).toContainText('4 cards');

  await item.getByTestId('run-play').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gate run');
  await page.getByRole('button', { name: 'Start camera' }).first().click();
  await expect(page.getByTestId('stage-entry')).toHaveText('C major');
  await page.getByTestId('deck-play').click();
  // Two seconds per card: the four cards in order, then it stops on the last.
  const seen: string[] = [];
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && seen.length < 4) {
    const text = (await page.getByTestId('stage-entry').textContent()) ?? '';
    if (seen[seen.length - 1] !== text) seen.push(text);
    await page.waitForTimeout(150);
  }
  expect(seen).toEqual(['C major', 'G major', 'A minor pentatonic', 'F major']);
  await expect(page.getByTestId('stage-entry-count')).toHaveText('Card 4 of 4');
  await expect(page.getByTestId('deck-play')).toHaveText('Start', { timeout: 5000 });
});

test('a run opened on the Stage without the camera shows the flat diagram', async ({
  mediaPage: page,
}) => {
  await page.goto('/#/library/chord/C/maj');
  await page.getByTestId('add-to-run').click();
  await page.getByRole('button', { name: 'Start a new run with it' }).click();
  await expect(page.getByTestId('run-builder')).toBeVisible();
  await page.getByTestId('run-next').click();
  await page.getByTestId('run-save').click();
  await page.getByTestId('run-play').click();
  await page.getByRole('button', { name: 'Use without camera' }).click();
  await expect(page.locator('.stage__deck .fretboard')).toBeVisible();
});
