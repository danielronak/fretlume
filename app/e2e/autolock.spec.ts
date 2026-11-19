/**
 * Phase 4 exit gate: automatic lock on the camera clips. The Stage finds the neck by itself and asks
 * "Looks right?"; after confirming, the dots land on the labelled cells. Without a guitar it must not
 * lock. Requires the shipped model (app/public/models/necknet-v1.*).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';

const here = dirname(fileURLToPath(import.meta.url));
const MODEL = resolve(here, '../public/models/necknet-v1.bin');
const generated = resolve(here, '../../fixtures/generated');

type M = number[];
interface Label {
  index: number;
  H: number[][] | null;
}
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

interface StageDebug {
  pose: { H: M | null; stamp?: number } | null;
  items: { kind: string; cx: number; cy: number }[];
}

async function worstErrors(page: Page, labels: Label[], samples: number) {
  const worst: number[] = [];
  for (let k = 0; k < samples; k++) {
    await page.waitForTimeout(300);
    const d = await page.evaluate(
      () => (window as unknown as { __fretlumeStage?: StageDebug }).__fretlumeStage ?? null,
    );
    const label = labels.find((l) => l.index === d?.pose?.stamp);
    if (!d?.pose?.H || !label?.H || d.items.length === 0) {
      worst.push(Infinity);
      continue;
    }
    const toBoard = invert(d.pose.H);
    const truthInv = invert(label.H.flat());
    let w = 0;
    for (const item of d.items) {
      if (item.kind !== 'dot') continue;
      const a = apply(toBoard, item.cx, item.cy);
      const b = apply(truthInv, item.cx, item.cy);
      w = Math.max(w, Math.hypot(a.x - b.x, a.y - b.y));
    }
    worst.push(w);
  }
  return worst;
}

test.skip(!existsSync(MODEL), 'no trained model shipped yet');

for (const [clip, guitar] of [
  ['lock-easy', 'steel-acoustic'],
  ['lock-hard', 'steel-acoustic'],
  ['lefty', 'electric'],
  ['capo', 'steel-acoustic'],
  ['low-light', 'steel-acoustic'],
] as const) {
  test.describe(`auto-lock: ${clip}`, () => {
    test.use({
      fakeMedia: { video: `clip-${clip}.mjpeg`, audio: 'tone-110hz.wav' },
      seedSettings: { onboarded: true, guitar, autoLock: true },
    });

    test(`locks by itself on ${clip} and the dots land on their cells`, async ({
      mediaPage: page,
    }) => {
      await page.addInitScript(() => localStorage.setItem('fretlume.debug', '1'));
      await page.goto('/#/stage/chord/G/maj');
      await page.getByRole('button', { name: 'Start camera' }).first().click();
      await page.getByTestId('stage-confirm').waitFor({ timeout: 45_000 });
      await page.getByTestId('stage-confirm').click();
      const worst = await worstErrors(page, labelsOf(clip), 12);
      expect(
        worst.filter((w) => w < 3).length / worst.length,
        `worst errors ${worst.map((w) => w.toFixed(2))}`,
      ).toBeGreaterThanOrEqual(0.8);
    });
  });
}

test.describe('auto-lock: after losing the neck', () => {
  test.use({
    fakeMedia: { video: 'clip-lock-easy.mjpeg', audio: 'tone-110hz.wav' },
    seedSettings: { onboarded: true, guitar: 'steel-acoustic', autoLock: true },
  });

  // Field test 2026-11-19: the automatic re-lock after a loss "succeeded" but tracking never started
  // again (the overlay froze until a manual re-lock).
  test('finds the neck again by itself and tracking resumes', async ({ mediaPage: page }) => {
    await page.addInitScript(() => localStorage.setItem('fretlume.debug', '1'));
    await page.goto('/#/stage/chord/G/maj');
    await page.getByRole('button', { name: 'Start camera' }).first().click();
    await page.getByTestId('stage-confirm').waitFor({ timeout: 45_000 });
    await page.getByTestId('stage-confirm').click();
    await page.waitForTimeout(1500);
    await page.evaluate(() =>
      (window as unknown as { __fretlumeForceLost: () => void }).__fretlumeForceLost(),
    );
    // Back to searching, then tracking again without any click.
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __fretlumeStage?: { phase: string } }).__fretlumeStage?.phase,
          ),
        { timeout: 30_000 },
      )
      .toBe('framing');
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __fretlumeStage?: { phase: string } }).__fretlumeStage?.phase,
          ),
        { timeout: 45_000 },
      )
      .toBe('tracking');
    await expect(page.getByTestId('stage-confirm')).toHaveCount(0);
    // Poses keep arriving: the frame stamp moves on.
    const stamp = () =>
      page.evaluate(
        () =>
          (window as unknown as { __fretlumeStage?: StageDebug }).__fretlumeStage?.pose?.stamp ??
          -1,
      );
    await page.waitForTimeout(1000);
    const first = await stamp();
    await page.waitForTimeout(1500);
    expect(await stamp()).not.toBe(first);
    const worst = await worstErrors(page, labelsOf('lock-easy'), 8);
    expect(
      worst.filter((w) => w < 3).length / worst.length,
      `worst errors ${worst.map((w) => w.toFixed(2))}`,
    ).toBeGreaterThanOrEqual(0.75);
  });
});

test.describe('auto-lock: no guitar', () => {
  test.use({
    fakeMedia: { video: 'clip-no-guitar.mjpeg', audio: 'tone-110hz.wav' },
    seedSettings: { onboarded: true, autoLock: true },
  });

  test('never locks on a scene without a guitar', async ({ mediaPage: page }) => {
    await page.goto('/#/stage/chord/G/maj');
    await page.getByRole('button', { name: 'Start camera' }).first().click();
    await expect(page.getByTestId('stage-hint')).toBeVisible();
    await page.waitForTimeout(12_000);
    await expect(page.getByTestId('stage-confirm')).toHaveCount(0);
    await expect(page.getByTestId('stage-hint')).toContainText('show the whole neck');
  });
});
