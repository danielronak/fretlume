/**
 * Parity audit (phase 5 task 5.9): one test per feature of the reference checklist P-F1…P-F15
 * (docs/research/01-product-teardown.md §1.2), each saving a screenshot to
 * docs/screens/phase-5/parity/. docs/PARITY.md lists them with the deeper tests behind each feature.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';

const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(here, '../../docs/screens/phase-5/parity');
/** Screenshots are written only when asked (PARITY_SHOTS=1), so routine runs leave docs/ alone. */
const shot = async (page: Page, id: string) => {
  if (process.env.PARITY_SHOTS) await page.screenshot({ path: resolve(SHOTS, `${id}.png`) });
};
const fixture = (path: string) => resolve(here, '../../fixtures', path);

interface StageDebug {
  items: { kind: string }[];
}
const overlayKinds = (page: Page) =>
  page.evaluate(() =>
    ((window as unknown as { __fretlumeStage?: StageDebug }).__fretlumeStage?.items ?? []).map(
      (i) => i.kind,
    ),
  );

async function lockedStage(page: Page, path: string) {
  await page.addInitScript(() => localStorage.setItem('fretlume.debug', '1'));
  await page.goto(`/#${path}`);
  await page.getByRole('button', { name: 'Start camera' }).first().click();
  await page.getByTestId('stage-confirm').waitFor({ timeout: 45_000 });
  await page.getByTestId('stage-confirm').click();
  await expect(page.getByRole('status').filter({ hasText: 'Locked' })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe('parity: camera', () => {
  test.use({
    fakeMedia: { video: 'clip-lock-easy.mjpeg', audio: 'tone-110hz.wav' },
    seedSettings: { onboarded: true, guitar: 'steel-acoustic', autoLock: true },
  });

  test('P-F1 live overlay: dots on the real neck, open strings by the nut, mirrored view', async ({
    mediaPage: page,
  }) => {
    await lockedStage(page, '/stage/chord/C/maj');
    await page.getByTestId('deck-next').click(); // one CAGED shape
    await expect
      .poll(async () => (await overlayKinds(page)).filter((k) => k === 'dot').length)
      .toBeGreaterThan(2);
    await expect(page.locator('.stage__video')).toHaveCSS('transform', /matrix\(-1/);
    await shot(page, 'P-F1');
  });

  test('P-F2 lock model: re-lock, flip strings, overlay size, full screen, end', async ({
    mediaPage: page,
  }) => {
    await lockedStage(page, '/stage/scale/A/minor-pentatonic');
    await expect(page.getByRole('button', { name: 'Re-lock' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'End' })).toBeVisible();
    await page.getByRole('slider', { name: 'Dot size' }).fill('1.4');
    await page.getByRole('switch', { name: 'Flip strings' }).click();
    await expect(page.getByRole('switch', { name: 'Flip strings' })).toBeChecked();
    await shot(page, 'P-F2');
    await page.getByRole('button', { name: 'Re-lock' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Locked' })).toBeHidden();
  });

  test('P-F3 deck: floats over the video in full screen, moves, collapses', async ({
    mediaPage: page,
  }) => {
    await lockedStage(page, '/stage/chord/G/maj');
    await page.getByRole('button', { name: 'Full screen' }).click();
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement?.className ?? ''))
      .toBe('stage__wrap');
    const deck = page.getByTestId('stage-deck');
    await expect(deck).toHaveCSS('position', 'fixed');
    const before = (await deck.boundingBox())!;
    await page.getByRole('button', { name: /Move the deck/ }).focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowRight');
    const after = (await deck.boundingBox())!;
    expect(after.y).toBeLessThan(before.y);
    expect(after.x).toBeGreaterThan(before.x);
    await shot(page, 'P-F3');
    await page.getByTestId('deck-collapse').click();
    await expect(page.getByTestId('deck-next')).toBeHidden();
    await page.getByTestId('deck-collapse').click();
    await expect(page.getByTestId('deck-next')).toBeVisible();
  });
});

test('P-F3 deck controls: next, back, loop, auto-advance, start, restart, one shape @smoke', async ({
  page,
}) => {
  await page.goto('/#/stage/chord/C/maj');
  await page.getByRole('button', { name: 'Use without camera' }).click();
  const label = page.getByTestId('stage-entry');
  await expect(label).toHaveText('All shapes');
  await page.getByTestId('deck-next').click();
  await expect(label).not.toHaveText('All shapes');
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(label).toHaveText('All shapes');
  await page.getByRole('switch', { name: 'Loop' }).click();
  await page.getByLabel('Auto-advance').selectOption('4');
  // Choosing an auto-advance time starts the deck; the button pauses and starts it.
  await expect(page.getByTestId('deck-play')).toHaveText('Pause');
  await page.getByTestId('deck-play').click();
  await expect(page.getByTestId('deck-play')).toHaveText('Start');
  await page.getByRole('button', { name: 'Restart' }).click();
  await expect(label).toHaveText('All shapes');
  await page.getByTestId('deck-next').click();
  const oneShape = page.getByRole('switch', { name: /shapes|shape/ });
  await oneShape.click();
  await expect(oneShape).not.toBeChecked();
  await shot(page, 'P-F3-controls');
});

test('P-F4 library: chords, scales, triads, keys, arpeggios; root picker; search @smoke', async ({
  page,
}) => {
  await page.goto('/#/library');
  for (const tab of ['Chords', 'Scales', 'Triads', 'Keys', 'Arpeggios'])
    await expect(page.getByRole('link', { name: tab, exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Root' }).getByRole('button')).toHaveCount(12);
  await page.getByRole('combobox', { name: 'Search the library' }).fill('sad chords in G');
  await expect(page.getByRole('option').first()).toContainText('G minor');
  await shot(page, 'P-F4');
});

test('P-F5 labels: notes, intervals, fingers @smoke', async ({ page }) => {
  await page.goto('/#/library/chord/A/min');
  const labels = page.getByRole('group', { name: 'Labels' });
  const neck = page.getByTestId('library-neck');
  await labels.getByRole('button', { name: 'Intervals' }).click();
  expect(new Set(await neck.locator('.fretboard__label').allTextContents())).toEqual(
    new Set(['1', 'b3', '5']),
  );
  await labels.getByRole('button', { name: 'Fingers' }).click();
  await shot(page, 'P-F5');
});

test('P-F6 CAGED: five shapes, colour by shape or by note, full neck @smoke', async ({ page }) => {
  await page.goto('/#/library/scale/A/minor-pentatonic');
  const shapes = page.getByRole('group', { name: 'Shapes' });
  for (const form of ['C', 'A', 'G', 'E', 'D'])
    await expect(shapes.getByRole('button', { name: `${form} shape` })).toBeVisible();
  await page.getByRole('group', { name: 'Colours' }).getByRole('button', { name: /note/i }).click();
  await shot(page, 'P-F6');
});

test('P-F7 triads: string sets and inversions @smoke', async ({ page }) => {
  await page.goto('/#/library/triad/D/maj');
  const sets = page.getByRole('group', { name: 'Strings' });
  for (const set of ['654', '543', '432', '321'])
    await expect(sets.getByRole('button', { name: `Strings ${set}` })).toBeVisible();
  await sets.getByRole('button', { name: 'Strings 432' }).click();
  const inv = page.getByRole('group', { name: 'Inversions' });
  await inv.getByRole('button', { name: '1st inversion' }).click();
  await expect(
    page.getByTestId('library-neck').locator('.fretboard__mark--dim').first(),
  ).toBeVisible();
  await shot(page, 'P-F7');
});

test('P-F8 keys: seven chords with numerals and roles @smoke', async ({ page }) => {
  await page.goto('/#/library/key/G/major');
  for (const role of ['Home', 'Moving away', 'Pulling home'])
    await expect(page.getByText(role).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /^(I|ii|iii|IV|V|vi|vii°)\s/ })).toHaveCount(7);
  await shot(page, 'P-F8');
});

test.describe('P-F9 neck profiles', () => {
  test.use({ seedSettings: { onboarded: true, guitar: 'electric' } });
  test('P-F9 electric draws 22 frets, acoustic 15 @smoke', async ({ page }) => {
    await page.goto('/#/library/chord/E/maj');
    const numbers = page.getByTestId('library-neck').locator('.fretboard__number');
    await expect(numbers).toHaveCount(22);
    await shot(page, 'P-F9');
    await page.goto('/#/settings');
    await page
      .getByRole('group', { name: 'Guitar' })
      .getByRole('button', { name: /Acoustic/ })
      .click();
    await page.goto('/#/library/chord/E/maj');
    await expect(page.getByTestId('library-neck').locator('.fretboard__number')).toHaveCount(15);
  });
});

test('P-F10 practice runs: builder steps and the saved list @smoke', async ({ page }) => {
  await page.goto('/#/library/runs');
  await page.getByTestId('runs-new').click();
  await page.getByTestId('run-add').click();
  await expect(page.getByTestId('run-chosen').locator('li')).toHaveCount(1);
  await shot(page, 'P-F10');
});

test.describe('P-F11 tuner', () => {
  test.use({ fakeMedia: { video: 'bars-720p.mjpeg', audio: 'tone-110hz.wav' } });
  test('P-F11 chromatic tuner reads the A string; pegs play reference tones', async ({
    mediaPage: page,
  }) => {
    await page.goto('/#/tools/tuner');
    await page.getByRole('button', { name: 'Hear A' }).click();
    await page.getByRole('button', { name: 'Turn on the microphone' }).click();
    await expect(page.getByTestId('tuner-display')).toContainText('A', { timeout: 10_000 });
    await shot(page, 'P-F11');
  });
});

test('P-F12 tab editor, import and play-along @smoke', async ({ page }) => {
  await page.goto('/#/tabs');
  await page.getByTestId('tabs-file-input').setInputFiles(fixture('generated/riff.gp'));
  await expect(page.getByTestId('tab-cell-0-2-4')).toHaveText('h7');
  await expect(page.getByLabel('Chord for bar 1')).toHaveValue('Am');
  await shot(page, 'P-F12');
  await page.getByTestId('tab-stage').click();
  await page.getByRole('button', { name: 'Use without camera' }).click();
  await expect(page.getByTestId('tab-strip')).toBeVisible();
  await shot(page, 'P-F12-play-along');
});

test('P-F13 lessons, playground and how-to guides @smoke', async ({ page }) => {
  await page.goto('/#/learn');
  await expect(page.getByTestId('lesson-card').first()).toBeVisible();
  await shot(page, 'P-F13');
  await page.goto('/#/playground');
  await expect(page.getByTestId('screen-playground')).toBeVisible();
  await page.goto('/#/help');
  await expect(page.locator('.help__card')).toHaveCount(11);
  await shot(page, 'P-F13-guides');
});

test.describe('P-F14 left-handed', () => {
  test.use({ seedSettings: { onboarded: true, handedness: 'left' } });
  test('P-F14 left-handed mirrors the diagrams and is remembered @smoke', async ({ page }) => {
    await page.goto('/#/library/chord/C/maj');
    const nut = page.getByTestId('library-neck').locator('.fretboard__nut');
    const x = Number(await nut.getAttribute('x1'));
    const width = Number(
      (await page
        .getByTestId('library-neck')
        .locator('svg')
        .first()
        .getAttribute('viewBox'))!.split(' ')[2],
    );
    expect(x).toBeGreaterThan(width / 2); // the nut is on the right
    await page.reload();
    expect(Number(await nut.getAttribute('x1'))).toBe(x);
    await shot(page, 'P-F14');
  });
});

test('P-F15 local data: backup and restore from Settings, nothing leaves the device @smoke', async ({
  page,
}) => {
  await page.goto('/#/settings');
  await expect(page.getByRole('button', { name: 'Save a backup file' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore from a backup file' })).toBeVisible();
  await page.getByRole('button', { name: 'Save a backup file' }).scrollIntoViewIfNeeded();
  await shot(page, 'P-F15');
  // The backup round trip is e2e/backup.spec.ts; no network after install is e2e/offline.spec.ts.
});
