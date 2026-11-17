import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Put a favourite straight into the app's database (the library UI arrives in task 2.3). */
async function addFavouriteDirectly(page: Page, id: string) {
  await page.evaluate(
    (itemId) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('fretlume');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('favourites', 'readwrite');
          tx.objectStore('favourites').put({ id: itemId, addedAt: Date.now() });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    id,
  );
}

async function countFavourites(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('fretlume');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const request = open.result.transaction('favourites').objectStore('favourites').count();
          request.onsuccess = () => {
            open.result.close();
            resolve(request.result);
          };
        };
      }),
  );
}

test.describe('backup @smoke', () => {
  test('save a backup, delete everything, restore it', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'Right hand on the neck' }).click();

    // First export opens the database; then add a favourite and export again.
    const first = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save a backup file' }).click();
    await first;
    await addFavouriteDirectly(page, 'chord-0-maj');

    const second = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save a backup file' }).click();
    const download = await second;
    expect(download.suggestedFilename()).toMatch(/^fretlume-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const file = await download.path();

    await page.getByRole('button', { name: 'Delete all my data' }).click();
    await page.getByRole('button', { name: 'Delete everything' }).click();
    await expect(page.getByText('All data on this device was deleted.')).toBeVisible();
    expect(await countFavourites(page)).toBe(0);
    await expect(page.getByRole('button', { name: 'Left hand on the neck' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByTestId('backup-file-input').setInputFiles(file);
    await expect(
      page.getByRole('dialog', { name: 'Replace what is on this device?' }),
    ).toContainText('1 favourites');
    await page.getByRole('button', { name: 'Replace with backup' }).click();
    await expect(page.getByText('Backup restored.')).toBeVisible();
    expect(await countFavourites(page)).toBe(1);
    await expect(page.getByRole('button', { name: 'Right hand on the neck' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.reload();
    await expect(page.getByRole('button', { name: 'Right hand on the neck' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('a file that is not a backup changes nothing', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByTestId('backup-file-input').setInputFiles({
      name: 'notes.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"hello":"world"}'),
    });
    await expect(page.getByText('That file is not a Fretlume backup.')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
