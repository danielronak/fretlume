import { expect, test } from './fixtures';

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

  test('a phone held sideways gets a side rail and keeps most of the height', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/#/library/chord/C/maj');
    const main = await page.locator('#main').boundingBox();
    expect(main!.height).toBeGreaterThanOrEqual(380);
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Tools', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tools' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'How it works' })).toBeVisible();
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
