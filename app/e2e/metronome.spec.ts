import { expect, test } from './fixtures';

test.describe('metronome @smoke', () => {
  test('starts, ticks on the audio clock, changes tempo and stops', async ({ page }) => {
    await page.goto('/#/tools/metronome');
    const metronome = page.getByTestId('metronome');
    await expect(page.getByTestId('metronome-bpm')).toContainText('90');
    await page.getByRole('button', { name: 'Faster' }).click();
    await expect(page.getByTestId('metronome-bpm')).toContainText('91');

    await page.getByRole('button', { name: 'Start' }).click();
    await expect(metronome).toHaveAttribute('data-running', 'true');
    // At 91 bpm, two seconds hold three clicks at least.
    await expect
      .poll(async () => Number(await metronome.getAttribute('data-clicks')), { timeout: 5_000 })
      .toBeGreaterThanOrEqual(3);
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(metronome).toHaveAttribute('data-running', 'false');
  });

  test('tap tempo sets the tempo from taps', async ({ page }) => {
    await page.goto('/#/tools/metronome');
    const tap = page.getByRole('button', { name: 'Tap tempo' });
    for (let i = 0; i < 4; i++) {
      await tap.click();
      await page.waitForTimeout(500);
    }
    const bpm = Number((await page.getByTestId('metronome-bpm').textContent())?.replace(/\D/g, ''));
    expect(bpm).toBeGreaterThanOrEqual(105);
    expect(bpm).toBeLessThanOrEqual(122);
  });
});
