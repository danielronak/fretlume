import { expect, test } from './fixtures';

test.describe('microphone @smoke', () => {
  test('captures the fake microphone and shows its level', async ({ mediaPage: page }) => {
    await page.goto('/#/tools');
    const panel = page.getByTestId('mic-panel');
    await expect(panel).toHaveAttribute('data-status', 'idle');
    await page.getByRole('button', { name: 'Turn on the microphone' }).click();
    await expect(panel).toHaveAttribute('data-status', 'running');
    await expect(page.getByText('Listening', { exact: true })).toBeVisible();

    // Samples keep arriving through the worklet into the ring buffer.
    await expect
      .poll(async () => Number(await panel.getAttribute('data-captured-samples')), {
        timeout: 10_000,
      })
      .toBeGreaterThan(20_000);
    const sampleRate = Number(await panel.getAttribute('data-sample-rate'));
    expect([44100, 48000]).toContain(sampleRate);

    // The fixture is a 110 Hz sine at half scale: about -9 dBFS RMS.
    await expect
      .poll(async () =>
        Number((await page.getByTestId('mic-level').textContent())?.replace(/[^-\d]/g, '')),
      )
      .toBeGreaterThan(-20);
    await expect(page.getByTestId('mic-verdict')).toHaveText('Good level.');

    await expect(page.getByLabel('Input')).toBeVisible();
    expect(await page.getByLabel('Input').locator('option').count()).toBeGreaterThanOrEqual(1);

    await page.getByRole('button', { name: 'Turn off' }).click();
    await expect(panel).toHaveAttribute('data-status', 'idle');
  });

  test('explains a blocked microphone and offers a retry', async ({ mediaPage: page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });
    await page.goto('/#/tools');
    await page.getByRole('button', { name: 'Turn on the microphone' }).click();
    await expect(page.getByRole('alert')).toContainText('Microphone access is blocked');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('notices when the microphone goes away', async ({ mediaPage: page }) => {
    await page.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        (window as unknown as { __testStream: MediaStream }).__testStream = stream;
        return stream;
      };
    });
    await page.goto('/#/tools');
    await page.getByRole('button', { name: 'Turn on the microphone' }).click();
    await expect(page.getByTestId('mic-panel')).toHaveAttribute('data-status', 'running');
    await page.evaluate(() => {
      const stream = (window as unknown as { __testStream: MediaStream }).__testStream;
      stream.getAudioTracks()[0]!.dispatchEvent(new Event('ended'));
    });
    await expect(page.getByRole('alert')).toContainText('The microphone stopped');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('mic-panel')).toHaveAttribute('data-status', 'running');
  });
});
