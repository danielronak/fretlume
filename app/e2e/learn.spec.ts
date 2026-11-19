/**
 * Lessons shell (phase 5 task 5.8): the lesson list, an explain section with its figure, a demo that
 * steps by itself, and the end of the lesson.
 */
import { expect } from '@playwright/test';
import { test } from './fixtures';

test('a lesson runs from the list to the end: explain, demo, finish @smoke', async ({ page }) => {
  await page.goto('/#/learn');
  await expect(page.getByTestId('lesson-card')).toHaveCount(3);
  await page.getByRole('link', { name: /Reading the neck/ }).click();
  await expect(page.getByTestId('lesson-progress')).toHaveText('Part 1 of 3');
  await expect(page.getByTestId('lesson-explain')).toBeVisible();
  await page.getByTestId('lesson-next').click();
  await expect(page.locator('.learn__figure svg.fretboard')).toBeVisible();
  await page.getByTestId('lesson-hear').click();
  await page.getByTestId('lesson-next').click();

  await expect(page.getByTestId('lesson-demo-step')).toHaveText('Step 1 of 3');
  await page.getByTestId('lesson-demo-next').click();
  await expect(page.getByTestId('lesson-demo-step')).toHaveText('Step 2 of 3');
  await expect(page.getByTestId('lesson-demo')).toContainText('A minor');
  await page.screenshot({ path: 'test-results/lesson-demo.png' });
  await page.getByTestId('lesson-next').click();
  await expect(page.getByTestId('lesson-done')).toBeVisible();
});
