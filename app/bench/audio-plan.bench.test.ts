/** `npm run fixtures:audio` step 1: write the audio fixture plan (see bench/audioPlan.ts). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { buildAudioPlan } from './audioPlan';
import { ROOT } from './data';

it('writes fixtures/generated/audio/plan.json', () => {
  const plan = buildAudioPlan();
  const dir = resolve(ROOT, 'fixtures/generated/audio');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'plan.json'), JSON.stringify(plan));
  const counts = Object.fromEntries(plan.groups.map((g) => [g.name, g.items.length]));
  console.log('audio plan', counts);
  expect(counts.notes).toBe(49);
});
