/** Lesson checks (precursor of gate G8.1): ids unique, figures exist, every section has content. */
import type { Lesson } from './types';

export function validateLessons(
  lessons: readonly Lesson[],
  itemExists: (itemId: string) => boolean,
): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const lesson of lessons) {
    if (ids.has(lesson.id)) problems.push(`${lesson.id}: duplicate id`);
    ids.add(lesson.id);
    if (lesson.sections.length === 0) problems.push(`${lesson.id}: no sections`);
    if (!(lesson.minutes > 0 && lesson.minutes <= 15)) problems.push(`${lesson.id}: minutes`);
    lesson.sections.forEach((section, i) => {
      const where = `${lesson.id} §${i + 1}`;
      if (section.kind === 'explain') {
        if (section.figure && !itemExists(section.figure.itemId))
          problems.push(`${where}: unknown item ${section.figure.itemId}`);
      } else {
        if (section.steps.length === 0) problems.push(`${where}: demo without steps`);
        for (const step of section.steps)
          if (!itemExists(step.itemId)) problems.push(`${where}: unknown item ${step.itemId}`);
      }
    });
  }
  return problems;
}
