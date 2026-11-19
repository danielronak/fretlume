import { describe, expect, it } from 'vitest';
import {
  duplicateRun,
  moveCard,
  newRun,
  runDurationMs,
  runSteps,
  sanitizeRun,
  type PracticeRun,
} from './run';
import { createSession, reduce } from './session';

const known = (id: string) => !id.startsWith('bogus');

function run(): PracticeRun {
  const r = newRun('run-1', 'Warm-up', ['chord-0-maj', 'chord-7-maj', 'scale-9-minor-pentatonic']);
  r.cards[1]!.repeats = 2;
  return r;
}

describe('practice runs', () => {
  it('steps: one per card, timed in the run unit, with repeats', () => {
    const steps = runSteps(run());
    expect(steps.map((s) => s.advance)).toEqual([
      { auto: 'timer', seconds: 8 },
      { auto: 'timer', seconds: 8 },
      { auto: 'timer', seconds: 8 },
    ]);
    expect(steps[1]!.repeats).toBe(2);
    const bars = {
      ...run(),
      unit: 'bars' as const,
      cards: run().cards.map((c) => ({ ...c, amount: 2 })),
    };
    expect(runSteps(bars)[0]!.advance).toEqual({ auto: 'bars', n: 2 });
  });

  it('plays through on the session engine: 4 repeats then finished', () => {
    let s = createSession(runSteps(run()));
    s = reduce(s, { type: 'start', tMs: 0 });
    for (const t of [8000, 16000, 24000, 32000]) s = reduce(s, { type: 'tick', tMs: t });
    expect(s.finished).toBe(true);
  });

  it('duration: seconds, and bars at the tempo', () => {
    expect(runDurationMs(run())).toBe(32_000);
    const bars = {
      ...run(),
      unit: 'bars' as const,
      tempoBpm: 120,
      cards: run().cards.map((c) => ({ ...c, amount: 1 })),
    };
    expect(runDurationMs(bars)).toBe(4 * 2000);
  });

  it('sanitize: clamps numbers, drops unknown items and fields, rejects non-runs', () => {
    const raw = {
      ...run(),
      evil: '<script>',
      tempoBpm: 9999,
      cards: [
        { itemId: 'chord-0-maj', entry: -3, amount: 0, repeats: 500 },
        { itemId: 'bogus-1' },
        'nonsense',
      ],
    };
    const s = sanitizeRun(raw, known)!;
    expect(s.tempoBpm).toBe(240);
    expect(s.cards).toEqual([{ itemId: 'chord-0-maj', entry: 0, amount: 2, repeats: 20 }]);
    expect('evil' in s).toBe(false);
    expect(sanitizeRun({ id: 'x' }, known)).toBeNull();
    expect(sanitizeRun(null, known)).toBeNull();
  });

  it('move and duplicate', () => {
    const r = run();
    expect(moveCard(r.cards, 0, 2).map((c) => c.itemId)).toEqual([
      'chord-7-maj',
      'scale-9-minor-pentatonic',
      'chord-0-maj',
    ]);
    const d = duplicateRun(r, 'run-2', 'Warm-up (copy)');
    d.cards[0]!.repeats = 9;
    expect(r.cards[0]!.repeats).toBe(1);
    expect(d.name).toBe('Warm-up (copy)');
  });
});
