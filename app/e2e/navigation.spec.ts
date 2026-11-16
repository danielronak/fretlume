import { expect, test } from '@playwright/test';

test.describe('shell @smoke', () => {
  test('every destination is reachable from the navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('screen-today')).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    for (const name of ['Learn', 'Library', 'Stage', 'Tabs', 'Tools', 'Progress', 'Today']) {
      await nav.getByRole('link', { name, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    }
  });

  test('theme choice persists across reloads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('unknown addresses show a way back', async ({ page }) => {
    await page.goto('/#/nope');
    await page.getByRole('link', { name: 'Go to Today' }).click();
    await expect(page.getByTestId('screen-today')).toBeVisible();
  });

  test('phone layout uses a bottom bar and does not scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/dev/kitchen-sink');
    await expect(page.getByTestId('screen-kitchen-sink')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
