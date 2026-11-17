import { expect, test } from './fixtures';

test.describe('library @smoke', () => {
  test('search finds sad chords in G and opens one', async ({ page }) => {
    await page.goto('/#/library');
    await page.getByRole('combobox', { name: 'Search the library' }).fill('sad chords in G');
    const options = page.getByRole('option');
    await expect(options.first()).toContainText('G minor');
    expect(await options.count()).toBeGreaterThanOrEqual(3);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/library\/chord\/G\/min$/);
    await expect(page.getByRole('heading', { level: 2, name: 'G minor' })).toBeVisible();
    await expect(page.getByTestId('item-notes')).toHaveText('G Bb D');
  });

  test('C major: five CAGED chips filter the neck, labels switch', async ({ page }) => {
    await page.goto('/#/library/chord/C/maj');
    const shapes = page.getByRole('group', { name: 'Shapes' });
    for (const form of ['C', 'A', 'G', 'E', 'D']) {
      await expect(shapes.getByRole('button', { name: `${form} shape` })).toBeVisible();
    }
    const neck = page.getByTestId('library-neck');
    await expect(neck.locator('.fretboard__mark--dim')).toHaveCount(0);

    await shapes.getByRole('button', { name: 'E shape' }).click();
    const dimmed = await neck.locator('.fretboard__mark--dim').count();
    const total = await neck.locator('.fretboard__mark').count();
    expect(dimmed).toBeGreaterThan(0);
    expect(dimmed).toBeLessThan(total);
    await expect(shapes.getByRole('button', { name: 'All shapes' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await shapes.getByRole('button', { name: 'All shapes' }).click();
    await expect(neck.locator('.fretboard__mark--dim')).toHaveCount(0);

    const labels = page.getByRole('group', { name: 'Labels' });
    const neckLabels = () => neck.locator('.fretboard__label').allTextContents();
    expect(new Set(await neckLabels())).toEqual(new Set(['C', 'E', 'G']));
    await labels.getByRole('button', { name: 'Intervals' }).click();
    expect(new Set(await neckLabels())).toEqual(new Set(['1', '3', '5']));
    await labels.getByRole('button', { name: 'Fingers' }).click();
    expect((await neckLabels()).every((label) => /^[1-4]$/.test(label))).toBe(true);

    // Choosing a voicing shows just that shape on the neck.
    await page.getByRole('button', { name: 'C major, played x35553' }).click();
    await expect(neck.locator('.fretboard__mark')).toHaveCount(5);
  });

  test('a favourite survives a reload and appears under Saved', async ({ page }) => {
    await page.goto('/#/library/scale/A/minor-pentatonic');
    const heart = page.getByTestId('favourite-toggle');
    await expect(heart).toHaveAttribute('aria-pressed', 'false');
    await heart.click();
    await expect(heart).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByTestId('favourite-toggle')).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('link', { name: 'Saved' }).click();
    const saved = page.getByTestId('library-saved');
    await saved.getByRole('link', { name: 'A minor pentatonic' }).click();
    await expect(page).toHaveURL(/#\/library\/scale\/A\/minor-pentatonic$/);
  });

  test('folders collect items', async ({ page }) => {
    await page.goto('/#/library/chord/G/maj');
    await page.getByRole('button', { name: 'Add to a folder' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add G to a folder' });
    await dialog.getByPlaceholder('Folder name').fill('Campfire');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog.getByRole('checkbox', { name: 'Campfire' })).toBeChecked();
    await dialog.getByRole('button', { name: 'Done' }).click();

    await page.goto('/#/library/saved');
    await expect(page.getByRole('heading', { level: 3, name: 'Campfire' })).toBeVisible();
    await expect(
      page.getByTestId('library-saved').getByRole('link', { name: 'G major' }),
    ).toBeVisible();
  });

  test('deep links, tabs and pickers move between items', async ({ page }) => {
    await page.goto('/#/library/chord/Fs/m7');
    await expect(page.getByRole('heading', { level: 2, name: 'F# minor seventh' })).toBeVisible();
    await page.getByRole('link', { name: 'Scales', exact: true }).click();
    await expect(page).toHaveURL(/#\/library\/scale\/Fs\/major$/);
    await page
      .getByRole('group', { name: 'Root' })
      .getByRole('button', { name: 'A', exact: true })
      .click();
    await page.getByLabel('Type').selectOption('dorian');
    await expect(page.getByRole('heading', { level: 2, name: 'A Dorian' })).toBeVisible();
    await page.getByRole('link', { name: 'Keys', exact: true }).click();
    await page.getByRole('link', { name: /^V\s*E\s*Pulling home/ }).click();
    await expect(page).toHaveURL(/#\/library\/chord\/E\/maj$/);
  });

  test('hear it plays the chord and the scale without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/#/library/chord/G/maj');
    await page.getByRole('button', { name: 'Strum this chord' }).click();
    await page.goto('/#/library/scale/A/minor-pentatonic');
    await page.getByRole('button', { name: 'Play these notes' }).click();
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });

  test('a broken address falls back to C major', async ({ page }) => {
    await page.goto('/#/library/chord/H/maj');
    await expect(page.getByRole('heading', { level: 2, name: 'C major' })).toBeVisible();
  });
});
