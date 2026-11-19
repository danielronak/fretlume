/**
 * Starter lessons (phase 5 task 5.8): enough to run the lesson player end to end. The curriculum
 * (≈ 70 lessons) is written in Phase 8. Our own wording; shapes come from the library.
 */
import type { Lesson } from './types';

export const LESSONS: Lesson[] = [
  {
    id: 'reading-the-neck',
    track: 'first-steps',
    titleKey: 'lessonReadingTitle',
    summaryKey: 'lessonReadingSummary',
    minutes: 4,
    sections: [
      { kind: 'explain', bodyKey: 'lessonReadingExplain1' },
      {
        kind: 'explain',
        bodyKey: 'lessonReadingExplain2',
        figure: { itemId: 'chord-4-min', voicing: 0 },
      },
      {
        kind: 'demo',
        steps: [
          { itemId: 'chord-4-min', voicing: 0, textKey: 'lessonReadingDemo1' },
          { itemId: 'chord-9-min', voicing: 0, textKey: 'lessonReadingDemo2' },
          { itemId: 'chord-0-maj', voicing: 0, textKey: 'lessonReadingDemo3' },
        ],
      },
    ],
  },
  {
    id: 'first-chords',
    track: 'chords',
    titleKey: 'lessonFirstChordsTitle',
    summaryKey: 'lessonFirstChordsSummary',
    minutes: 6,
    sections: [
      {
        kind: 'explain',
        bodyKey: 'lessonFirstChordsExplain1',
        figure: { itemId: 'chord-7-maj', voicing: 0 },
      },
      {
        kind: 'demo',
        steps: [
          { itemId: 'chord-7-maj', voicing: 0, textKey: 'lessonFirstChordsDemo1', seconds: 8 },
          { itemId: 'chord-2-maj', voicing: 0, textKey: 'lessonFirstChordsDemo2', seconds: 8 },
          { itemId: 'chord-7-maj', voicing: 0, textKey: 'lessonFirstChordsDemo3', seconds: 8 },
        ],
      },
      { kind: 'explain', bodyKey: 'lessonFirstChordsExplain2' },
    ],
  },
  {
    id: 'pentatonic-box',
    track: 'lead',
    titleKey: 'lessonPentatonicTitle',
    summaryKey: 'lessonPentatonicSummary',
    minutes: 5,
    sections: [
      {
        kind: 'explain',
        bodyKey: 'lessonPentatonicExplain1',
        figure: { itemId: 'scale-9-minor-pentatonic', entry: 3 },
      },
      {
        kind: 'demo',
        steps: [
          { itemId: 'scale-9-minor-pentatonic', entry: 3, textKey: 'lessonPentatonicDemo1' },
          { itemId: 'scale-9-minor-pentatonic', entry: 0, textKey: 'lessonPentatonicDemo2' },
        ],
      },
    ],
  },
];

export const lessonById = (id: string): Lesson | undefined => LESSONS.find((l) => l.id === id);
