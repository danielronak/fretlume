import { expect, test } from './fixtures';

test.describe('installable PWA @smoke', () => {
  test('manifest has what browsers need to offer installation', async ({ request }) => {
    const manifest = (await (await request.get('/manifest.webmanifest')).json()) as {
      name: string;
      short_name: string;
      start_url: string;
      display: string;
      theme_color: string;
      background_color: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(manifest.display);
    expect(manifest.theme_color).toMatch(/^#/);
    expect(manifest.background_color).toMatch(/^#/);
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      const response = await request.get(`/${icon.src}`);
      expect(response.headers()['content-type']).toContain('image/png');
    }
  });

  test('the page links the manifest and a service worker takes control', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    const controlled = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
        );
      }
      return navigator.serviceWorker.controller !== null;
    });
    expect(controlled).toBe(true);
  });

  test('first load, including everything cached for offline use, is under 5 MB', async ({
    page,
  }) => {
    let bytes = 0;
    page.context().on('response', async (response) => {
      try {
        bytes += (await response.body()).length;
      } catch {
        // Redirects and opaque responses have no body to count.
      }
    });
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      // Precaching happens during install; wait until the worker is active.
      while (navigator.serviceWorker.controller === null)
        await new Promise((r) => setTimeout(r, 50));
    });
    await page.waitForTimeout(500);
    console.log(`first-load transfer: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
    expect(bytes).toBeLessThan(5 * 1024 * 1024);
  });
});
