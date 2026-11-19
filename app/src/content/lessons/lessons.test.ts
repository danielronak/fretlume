import { describe, expect, it } from 'vitest';
import { libraryItem } from '@core/theory/library/index';
import { en } from '@i18n/en';
import { LESSONS } from './index';
import { validateLessons } from './validate';

describe('lessons', () => {
  it('all starter lessons are valid and every text exists', () => {
    expect(validateLessons(LESSONS, (id) => libraryItem(id) !== undefined)).toEqual([]);
    for (const lesson of LESSONS) {
      expect(en[lesson.titleKey]).toBeTruthy();
      for (const s of lesson.sections)
        if (s.kind === 'explain') expect(en[s.bodyKey]).toBeTruthy();
        else for (const step of s.steps) expect(en[step.textKey]).toBeTruthy();
    }
  });

  it('the validator reports problems', () => {
    const bad = [
      { ...LESSONS[0]!, sections: [] },
      { ...LESSONS[0]!, sections: [{ kind: 'demo' as const, steps: [] }] },
    ];
    expect(validateLessons(bad, () => false)).toEqual([
      'reading-the-neck: no sections',
      'reading-the-neck: duplicate id',
      'reading-the-neck §1: demo without steps',
    ]);
  });
});
