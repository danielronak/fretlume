/** Playground (phase 5 task 5.3, parity P-F13): layers, steppers, progression, send to Stage. */
import { expect } from '@playwright/test';
import { test } from './fixtures';

test.use({ seedSettings: { onboarded: true } });

test('layers, root and shape steppers, a progression, and the Stage @smoke', async ({ page }) => {
  await page.goto('/#/tools');
  await page.getByTestId('tool-playground').click();
  await expect(page.getByTestId('screen-playground')).toBeVisible();

  await page.getByTestId('pg-kind').selectOption('chord');
  await page.getByTestId('pg-root').selectOption('9');
  await page.getByTestId('pg-type').selectOption('min');
  await page.getByTestId('pg-add').click();
  await page.getByTestId('pg-kind').selectOption('scale');
  await page.getByTestId('pg-root').selectOption('9');
  await page.getByTestId('pg-type').selectOption('minor-pentatonic');
  await page.getByTestId('pg-add').click();
  await expect(page.getByTestId('pg-layer')).toHaveCount(2);
  // Shared chord/scale notes are drawn once, as split dots.
  const marks = page.locator('[data-testid="pg-board"] .fretboard__mark');
  await expect(marks.first()).toBeVisible();

  await page.getByTestId('pg-root-up').click();
  await expect(page.getByTestId('pg-root-name')).toHaveText(/^A[#♯]\/B[b♭]$/);
  await expect(page.getByTestId('pg-layer').first()).toContainText(/B[b♭] minor/);
  await page.getByTestId('pg-root-down').click();

  await page.getByRole('button', { name: 'Next shape of A minor', exact: true }).click();
  await expect(page.getByTestId('pg-layer-shape').first()).not.toHaveText('All shapes');

  await page.getByTestId('pg-progression').fill('C G Am F');
  await expect(page.getByTestId('pg-chord')).toHaveCount(4);
  await page.getByTestId('pg-chord').nth(1).click();
  await expect(page.getByTestId('pg-layer').first()).toContainText('G major');
  await expect(page.getByTestId('pg-layer').nth(1)).toContainText('A minor pentatonic');

  // Kept across a reload.
  await page.reload();
  await expect(page.getByTestId('pg-layer')).toHaveCount(2);

  await page.getByTestId('pg-to-stage').click();
  await page.getByRole('button', { name: 'Use without camera' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Playground');
  await expect(page.getByTestId('stage-entry-count')).toHaveText('1 / 4');
  await expect(page.getByTestId('stage-entry')).toHaveText('C major + A minor pentatonic');
  await page.getByTestId('deck-next').click();
  await expect(page.getByTestId('stage-entry')).toHaveText('G major + A minor pentatonic');
});
