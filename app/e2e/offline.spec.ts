import type { Page, Request } from '@playwright/test';
import { expect, test } from './fixtures';

const isLocal = (url: string) => {
  const { protocol, hostname } = new URL(url);
  return (
    protocol === 'data:' ||
    protocol === 'blob:' ||
    protocol === 'about:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1'
  );
};

/** Wait until the service worker has precached the app and controls this page. */
async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      );
    }
  });
}

test.describe('offline and private @smoke', () => {
  // Hard product rule 1 (CLAUDE.md): no network at runtime.
  test('the app makes no external requests', async ({ page, context }) => {
    const external: string[] = [];
    const record = (request: Request) => {
      if (!isLocal(request.url())) external.push(request.url());
    };
    context.on('request', record);
    await context.route(
      (url) => !isLocal(url.toString()),
      (route) => route.abort(),
    );

    await page.goto('/');
    await waitForServiceWorker(page);
    for (const hash of [
      '#/library',
      '#/library/scale/A/minor-pentatonic',
      '#/stage',
      '#/tools',
      '#/tools/tuner',
      '#/tools/metronome',
      '#/help',
      '#/help/diagrams',
      '#/dev/kitchen-sink',
      '#/settings',
    ]) {
      await page.goto(`/${hash}`);
      await expect(page.locator('h1')).toBeVisible();
    }
    await page.reload();
    await expect(page.locator('h1')).toBeVisible();

    expect(external).toEqual([]);
  });

  test('the app reloads and navigates with the network off', async ({ page, context }) => {
    await page.goto('/');
    await waitForServiceWorker(page);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('screen-today')).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Library', exact: true })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();

    // A cold start while offline must work too (fonts, icons and scripts all come from the cache).
    await page.goto('/#/dev/kitchen-sink');
    await page.reload();
    await expect(page.getByTestId('screen-kitchen-sink')).toBeVisible();
    const fontLoaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('600 16px "Manrope Variable"');
    });
    expect(fontLoaded).toBe(true);
  });

  test('the web manifest and icons are served', async ({ request }) => {
    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.ok()).toBe(true);
    const json = (await manifest.json()) as { name: string; icons: { src: string }[] };
    expect(json.name).toBe('Fretlume');
    for (const icon of json.icons) {
      const response = await request.get(`/${icon.src}`);
      expect(response.ok(), icon.src).toBe(true);
    }
  });
});
