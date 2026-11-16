import { expect, test } from '@playwright/test';

test.describe('diagram contact sheet @smoke', () => {
  test('renders generated chord boxes and neck diagrams', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/#/dev/diagrams');

    const boxes = page.getByTestId('sheet-boxes').locator('svg');
    const necks = page.getByTestId('sheet-necks').locator('svg');
    await expect(boxes).toHaveCount(18);
    await expect(necks).toHaveCount(22);

    // The open C chord: an accessible description and the three fretted notes with finger numbers.
    const c = page.getByRole('img', { name: /^C major: string 5 fret 3 C/ }).first();
    await expect(c).toBeVisible();
    await expect(c.locator('.fretboard__mark')).toHaveCount(3);
    await expect(c.locator('.fretboard__open')).toHaveCount(2);

    // Every dot sits inside its own diagram.
    const outside = await page.evaluate(() => {
      let count = 0;
      for (const svg of document.querySelectorAll('svg.fretboard')) {
        const box = svg.getBoundingClientRect();
        for (const dot of svg.querySelectorAll('.fretboard__mark')) {
          const r = dot.getBoundingClientRect();
          if (
            r.left < box.left - 1 ||
            r.right > box.right + 1 ||
            r.top < box.top - 1 ||
            r.bottom > box.bottom + 1
          )
            count++;
        }
      }
      return count;
    });
    expect(outside).toBe(0);
    expect(errors).toEqual([]);
  });
});
