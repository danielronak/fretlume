import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { test } from './fixtures';

test.describe('field test @smoke', () => {
  test('checklist is remembered and diagnostics export a file without camera frames by default', async ({
    page,
  }) => {
    await page.goto('/#/settings');
    await page.getByTestId('field-test-link').click();
    await expect(page.getByRole('heading', { name: 'Field test', level: 1 })).toBeVisible();
    await page.getByRole('switch', { name: 'Tune all six strings' }).click();
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Tune all six strings' })).toBeChecked();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('diagnostics-export').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^fretlume-diagnostics-\d{4}-\d\d-\d\d-\d{4}\.json$/,
    );
    const bundle = JSON.parse(readFileSync((await download.path())!, 'utf8')) as {
      kind: string;
      app: string;
      frames: unknown[];
    };
    expect(bundle.kind).toBe('fretlume-diagnostics');
    expect(bundle.frames).toEqual([]);
  });
});
