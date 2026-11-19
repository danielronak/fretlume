/**
 * Phase 3 task 3.10: lock on synthetic camera clips (fake camera) and check that overlay dots land
 * on the labelled board positions. Frames carry their number in the corner (debug mode reads it), so
 * each sampled pose is compared with the label of the frame it was measured on.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';

type M = number[];
interface Label {
  index: number;
  H: number[][] | null;
  control_points: [number, number][] | null;
}

const generated = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/generated');
const labelsOf = (clip: string): Label[] =>
  readFileSync(resolve(generated, `clip-${clip}.labels.jsonl`), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Label);

const apply = (H: M, x: number, y: number) => {
  const w = H[6]! * x + H[7]! * y + H[8]!;
  return { x: (H[0]! * x + H[1]! * y + H[2]!) / w, y: (H[3]! * x + H[4]! * y + H[5]!) / w };
};
const invert = (m: M): M => {
  const [a, b, c, d, e, f, g, h, i] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A,
    -(b * i - c * h),
    b * f - c * e,
    B,
    a * i - c * g,
    -(a * f - c * d),
    C,
    -(a * h - b * g),
    a * e - b * d,
  ].map((v) => v / det);
};

/** Seeded uniform noise in [-1, 1]. */
function noise(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
}

interface StageDebug {
  phase: string;
  frozenStamp: number | null;
  pose: {
    H: M | null;
    state: string;
    stamp?: number;
    confidence: number;
    tCaptureMs: number;
  } | null;
  items: { kind: string; cx: number; cy: number }[];
  /** The grid actually drawn, and the capture time it describes (overlay prediction). */
  shownH: M | null;
  describesMs: number | null;
  lock: { found: boolean; verified: boolean; confidence: number } | null;
}
const debug = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __fretlumeStage?: StageDebug }).__fretlumeStage ?? null,
  );

async function openStage(page: Page, item = 'chord/C/maj') {
  await page.addInitScript(() => localStorage.setItem('fretlume.debug', '1'));
  await page.goto(`/#/stage/${item}`);
  await page.getByRole('button', { name: 'Start camera' }).first().click();
  await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0);
}

/**
 * Freeze, drag the four handles to the labelled corners (± noisePx), snap. With `stillUntil`, only
 * freeze on frames before that number (moving clips hold still at first, as a player does while
 * locking); otherwise cancel and try again.
 */
async function markAndSnap(
  page: Page,
  labels: Label[],
  noisePx: number,
  seed: number,
  stillUntil = Infinity,
  mirror = true,
) {
  let frozen = 0;
  for (let attempt = 0; attempt < 40; attempt++) {
    await page.getByTestId('stage-lock').click();
    await page.waitForSelector('[data-testid=lock-handle-1]');
    frozen = (await debug(page))?.frozenStamp ?? 0;
    if (frozen < stillUntil) break;
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(250);
  }
  const label = labels.find((l) => l.index === frozen) ?? labels[0]!;
  const box = (await page.locator('.stage__box').boundingBox())!;
  const scale = box.width / 1280;
  const rand = noise(seed);
  for (let i = 0; i < 4; i++) {
    const [x, y] = label.control_points![i]!;
    const tx = x + noisePx * rand();
    const ty = y + noisePx * rand();
    const handle = (await page.getByTestId(`lock-handle-${i + 1}`).boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + (mirror ? 1280 - tx : tx) * scale, box.y + ty * scale, {
      steps: 4,
    });
    await page.mouse.up();
  }
  await page.getByTestId('stage-snap').click();
  await page.getByTestId('stage-confirm').waitFor({ timeout: 30_000 });
}

/**
 * Sample the overlay `samples` times; for each, map every dot back to the board through the grid the
 * app drew and forward through the label of the clip frame that grid describes (the drawing may be
 * predicted ahead of the tracked frame; the clips play at 30 fps). Returns the worst error per sample
 * in mm.
 */
async function sampleOverlay(page: Page, labels: Label[], samples: number) {
  const worst: number[] = [];
  for (let k = 0; k < samples; k++) {
    await page.waitForTimeout(250);
    const d = await debug(page);
    const H = d?.shownH ?? d?.pose?.H;
    const stamp = d?.pose?.stamp;
    const ahead =
      d?.describesMs != null && d.pose
        ? Math.round((d.describesMs - d.pose.tCaptureMs) / (1000 / 30))
        : 0;
    const frame = stamp === undefined ? undefined : (stamp + Math.max(0, ahead)) % labels.length;
    const label = labels.find((l) => l.index === frame);
    if (!d || !H || !label?.H || d.items.length === 0) {
      worst.push(Infinity);
      continue;
    }
    const truth = label.H.flat();
    const truthInv = invert(truth);
    const toBoard = invert(H);
    let w = 0;
    for (const item of d.items) {
      if (item.kind !== 'dot') continue;
      const b = apply(toBoard, item.cx, item.cy);
      const shown = apply(truthInv, item.cx, item.cy);
      // Board-space distance between where the app put the dot and where it belongs.
      w = Math.max(w, Math.hypot(shown.x - b.x, shown.y - b.y));
    }
    worst.push(w);
  }
  return worst;
}

const fraction = (xs: number[], ok: (x: number) => boolean) => xs.filter(ok).length / xs.length;

test.describe('stage: lock on a still guitar @smoke', () => {
  test.use({
    fakeMedia: { video: 'clip-lock-easy.mjpeg', audio: 'tone-110hz.wav' },
    seedSettings: { onboarded: true, autoLock: false },
  });

  test('taps with ±6 px noise snap to a verified lock and the dots land on their cells', async ({
    mediaPage: page,
  }) => {
    const labels = labelsOf('lock-easy');
    await openStage(page);
    await markAndSnap(page, labels, 6, 7);
    await expect(page.getByTestId('stage-confirm-message')).toHaveText(
      'The grid lines up with your frets.',
    );
    await page.getByTestId('stage-confirm').click();
    await expect(page.getByRole('status').filter({ hasText: 'Locked' })).toBeVisible();
    const worst = await sampleOverlay(page, labels, 8);
    // Within 2.5 mm of the true position: well inside a string spacing (≈ 7 mm) and a fret.
    expect(
      fraction(worst, (w) => w < 2.5),
      `worst errors ${worst.map((w) => w.toFixed(2))}`,
    ).toBeGreaterThanOrEqual(0.9);
    await page.getByTestId('deck-next').click();
    await expect(page.getByTestId('stage-entry')).not.toHaveText('All shapes');
  });
});

for (const [clip, guitar, item, stillUntil] of [
  ['track-hand', 'steel-acoustic', 'chord/G/maj', 30],
  ['track-motion', 'steel-acoustic', 'scale/A/minor-pentatonic', 30],
  ['lefty', 'electric', 'chord/D/min', Infinity],
  ['capo', 'steel-acoustic', 'chord/C/maj', Infinity],
  ['low-light', 'steel-acoustic', 'chord/E/min', Infinity],
] as const) {
  test.describe(`stage: ${clip}`, () => {
    test.use({
      fakeMedia: { video: `clip-${clip}.mjpeg`, audio: 'tone-110hz.wav' },
      seedSettings: { onboarded: true, guitar, autoLock: false },
    });

    test(`locks and tracks on the ${clip} clip`, async ({ mediaPage: page }) => {
      const labels = labelsOf(clip);
      await openStage(page, item);
      await markAndSnap(page, labels, 6, 11, stillUntil);
      await page.getByTestId('stage-confirm').click();
      // Long enough to cover the motion of the moving clips.
      const worst = await sampleOverlay(page, labels, 24);
      expect(
        fraction(worst, (w) => w < 3),
        `worst errors ${worst.map((w) => w.toFixed(2))}`,
      ).toBeGreaterThanOrEqual(0.8);
    });
  });
}

test.describe('stage: no guitar in view', () => {
  test.use({
    fakeMedia: { video: 'clip-no-guitar.mjpeg', audio: 'tone-110hz.wav' },
    seedSettings: { onboarded: true, autoLock: false },
  });

  test('a lock on an empty scene is never shown as verified', async ({ mediaPage: page }) => {
    await openStage(page);
    const labels = labelsOf('lock-easy'); // any plausible handle positions
    await markAndSnap(page, labels, 0, 1);
    await expect(page.getByTestId('stage-confirm-message')).not.toHaveText(
      'The grid lines up with your frets.',
    );
  });
});

test.describe('stage without a camera @smoke', () => {
  test('shows the flat diagram and the deck', async ({ page }) => {
    await page.goto('/#/stage/chord/C/maj');
    await page.getByRole('button', { name: 'Use without camera' }).click();
    await expect(page.getByTestId('stage-deck')).toBeVisible();
    await expect(page.getByTestId('stage-entry')).toHaveText('All shapes');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('stage-entry')).not.toHaveText('All shapes');
  });

  test('the library opens an item on the stage', async ({ page }) => {
    await page.goto('/#/library/chord/C/maj');
    await page.getByTestId('open-on-guitar').click();
    await expect(page).toHaveURL(/#\/stage\/chord\/C\/maj$/);
    await expect(page.getByRole('heading', { name: 'C major', level: 1 })).toBeVisible();
  });
});
