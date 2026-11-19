import { expect, test } from './fixtures';

test.describe('help @smoke', () => {
  test('every guide opens from the index and from the navigation', async ({ page }) => {
    await page.goto('/#/today');
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'How it works' })
      .click();
    await expect(page.getByTestId('screen-help')).toBeVisible();
    const titles = [
      'Reading the diagrams',
      'Finding chords and scales',
      'Tuning up',
      'Practising with a metronome',
      'Install it and use it offline',
      'Show shapes on your guitar',
      'Make a practice run',
      'Combine shapes in the playground',
      'Write a tab',
      'Bring in a tab',
      'Play along with a tab',
    ];
    for (const title of titles) {
      await page.goto('/#/help');
      await page.getByRole('link', { name: new RegExp(`^${title}`) }).click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    }
    await page.goto('/#/help/nope');
    await expect(page.getByTestId('screen-help')).toBeVisible();
  });
});
