/**
 * Tabs (phase 5 tasks 5.5–5.6, parity P-F12; exit gate item 3): write a tab with a hammer-on, a slide
 * and a bend on the keyboard, play it, export ASCII, import that file again and get the same tab.
 * Also imports a Guitar Pro file and a pasted chord sheet.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { test } from './fixtures';

test.use({ seedSettings: { onboarded: true } });

const fixture = (path: string) => fileURLToPath(new URL(`../../fixtures/${path}`, import.meta.url));

test('write hammer-on, slide, bend → play → export ASCII → re-import is the same @smoke', async ({
  page,
}) => {
  await page.goto('/#/tabs');
  await page.getByTestId('tabs-new').click();
  await expect(page.getByTestId('screen-tab-editor')).toBeVisible();
  await page.getByTestId('tab-title').fill('Gate riff');
  await page.getByTestId('tab-title').press('Enter');

  const grid = page.getByTestId('tab-grid');
  await grid.focus();
  // G string (3): 5, then h7 and /9 as eighths, then a bend on the B string.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('5');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('7');
  await page.keyboard.press('h');
  await page.keyboard.press('-');
  await page.keyboard.press('Enter'); // a new beat after this one (eighth, like this one)
  await page.keyboard.press('9');
  await page.keyboard.press('/');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('8');
  await page.keyboard.press('b');
  // Two quick digits make fret 12 on the next beat, high e.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await expect(page.getByTestId('tab-cell-0-0-3')).toHaveText('5');
  await expect(page.getByTestId('tab-cell-0-1-3')).toHaveText('h7');
  await expect(page.getByTestId('tab-cell-0-2-3')).toHaveText('/9');
  await expect(page.getByTestId('tab-cell-0-3-2')).toHaveText('8b10');
  await expect(page.getByTestId('tab-cell-0-4-1')).toHaveText('12');
  // Undo and redo the 12.
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('tab-cell-0-4-1')).toHaveText('');
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('tab-cell-0-4-1')).toHaveText('12');
  await page.getByTestId('tab-cell-0-0-6').click(); // the pointer moves the cursor
  await expect(page.getByTestId('tab-status')).toContainText('string 6');

  // Play: the playhead runs through the first bar, then stop.
  await page.getByTestId('tab-play').click();
  await expect(page.locator('.tabcol.is-playing')).toHaveCount(1, { timeout: 5000 });
  await page.getByTestId('tab-play').click();
  await expect(page.locator('.tabcol.is-playing')).toHaveCount(0);

  await expect(page.getByTestId('tab-saved')).toHaveText('Saved on this device');
  await page.screenshot({ path: 'test-results/tab-editor.png' });

  const download = page.waitForEvent('download');
  await page.getByTestId('tab-export-ascii').click();
  const file = await (await download).path();
  const ascii = readFileSync(file, 'utf8');
  expect(ascii).toContain('Title: Gate riff');
  expect(ascii).toMatch(/^G\s*\|-5-h7-\/9-/m);

  // Import the exported file as a new tab and export it again: identical text.
  await page.goto('/#/tabs');
  await page.getByTestId('tabs-file-input').setInputFiles(file);
  await expect(page.getByTestId('screen-tab-editor')).toBeVisible();
  await expect(page.getByTestId('tab-cell-0-3-2')).toHaveText('8b10');
  const again = page.waitForEvent('download');
  await page.getByTestId('tab-export-ascii').click();
  expect(readFileSync(await (await again).path(), 'utf8')).toBe(ascii);

  await page.goto('/#/tabs');
  await expect(page.getByTestId('tab-item')).toHaveCount(2);
});

test('imports a Guitar Pro file and a pasted chord sheet', async ({ page }) => {
  await page.goto('/#/tabs');
  await page.getByTestId('tabs-file-input').setInputFiles(fixture('generated/riff.gp'));
  await expect(page.getByTestId('screen-tab-editor')).toBeVisible();
  await expect(page.getByTestId('tab-title')).toHaveValue('GP Riff');
  await expect(page.getByTestId('tab-cell-0-2-4')).toHaveText('h7');
  await expect(page.getByLabel('Chord for bar 1')).toHaveValue('Am');

  await page.goto('/#/tabs');
  await page.getByTestId('tabs-paste').click();
  await page.getByTestId('tabs-paste-text').fill(readFileSync(fixture('tabs/chords.cho'), 'utf8'));
  await page.getByTestId('tabs-paste-import').click();
  await expect(page.getByTestId('tab-title')).toHaveValue('Fixture Chords');
  await expect(page.getByLabel('Chord for bar 2')).toHaveValue('Am');

  await page.goto('/#/tabs');
  await page.getByTestId('tabs-paste').click();
  await page.getByTestId('tabs-paste-text').fill('just words');
  await page.getByTestId('tabs-paste-import').click();
  await expect(page.getByRole('alert')).toContainText('No tab found');
});

test('play along on the Stage without a camera: strip scrolls, notes and rings on the neck', async ({
  page,
}) => {
  await page.goto('/#/tabs');
  await page.getByTestId('tabs-file-input').setInputFiles(fixture('tabs/riff.txt'));
  await expect(page.getByTestId('screen-tab-editor')).toBeVisible();
  await page.getByTestId('tab-stage').click();
  await page.getByRole('button', { name: 'Use without camera' }).click();
  await expect(page.getByTestId('stage-entry')).toHaveText('Fixture Riff');
  await expect(page.getByTestId('tab-strip')).toBeVisible();
  // Before playing: the first notes are on the neck already.
  await expect(page.locator('.fretboard .fretboard__dot, .fretboard circle').first()).toBeVisible();
  await page.getByTestId('tab-stage-play').click();
  await expect(page.locator('.tabstrip__col.is-now')).toHaveCount(1, { timeout: 6000 });
  await expect(page.getByTestId('fretboard-approach').first()).toBeVisible({ timeout: 6000 });
  await page.screenshot({ path: 'test-results/tab-stage.png' });
  await page.getByTestId('tab-stage-play').click();
});

test.describe('play along on the camera', () => {
  test.use({
    fakeMedia: { video: 'clip-lock-easy.mjpeg', audio: 'tone-110hz.wav' },
    seedSettings: { onboarded: true, guitar: 'steel-acoustic', autoLock: true },
  });

  test('after the automatic lock, sounding notes and approaching rings are drawn on the neck', async ({
    mediaPage: page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('fretlume.debug', '1'));
    await page.goto('/#/tabs');
    await page.getByTestId('tabs-file-input').setInputFiles(fixture('tabs/riff.txt'));
    await page.getByTestId('tab-stage').click();
    await page.getByRole('button', { name: 'Start camera' }).first().click();
    await page.getByTestId('stage-confirm').waitFor({ timeout: 45_000 });
    await page.getByTestId('stage-confirm').click();
    await page.getByTestId('tab-stage-play').click();
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const items =
              (window as unknown as { __fretlumeStage?: { items: { kind: string }[] } })
                .__fretlumeStage?.items ?? [];
            return items.some((i) => i.kind === 'ring') && items.some((i) => i.kind === 'dot');
          }),
        { timeout: 10_000 },
      )
      .toBe(true);
    await page.screenshot({ path: 'test-results/tab-stage-camera.png' });
  });
});
