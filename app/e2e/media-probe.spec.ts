import { expect, test } from './fixtures';

test.describe('fake camera and microphone @smoke', () => {
  test('camera frames and microphone samples reach the page', async ({ mediaPage }) => {
    await mediaPage.goto('/#/dev/media-probe');
    await mediaPage.getByRole('button', { name: 'Start probe' }).click();

    await expect(mediaPage.getByTestId('probe-video-size')).toHaveText('1280×720', {
      timeout: 20_000,
    });
    const peakHz = Number(await mediaPage.getByTestId('probe-audio-hz').textContent());
    expect(Math.abs(peakHz - 110), `measured ${peakHz} Hz`).toBeLessThanOrEqual(2);
  });
});
