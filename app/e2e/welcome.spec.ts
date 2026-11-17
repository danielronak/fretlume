import { expect, test } from './fixtures';

test.describe('first-run welcome @smoke', () => {
  test.use({ seedSettings: null });

  test('a first visit walks through three skippable steps and remembers the answers', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('screen-welcome')).toBeVisible();
    await expect(page.getByText('Step 1 of 3')).toBeVisible();

    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('radio', { name: /Right hand on the neck/ }).click();
    await expect(page.getByRole('radio', { name: /Right hand on the neck/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('radio', { name: /Electric/ }).click();
    await page.getByRole('button', { name: 'Start playing' }).click();

    await expect(page.getByTestId('screen-today')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('screen-today')).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fretlume.settings')!));
    expect(saved.state).toMatchObject({ onboarded: true, handedness: 'left', guitar: 'electric' });
  });

  test('skip goes straight to the app', async ({ page }) => {
    await page.goto('/#/library');
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByTestId('screen-today')).toBeVisible();
  });
});
