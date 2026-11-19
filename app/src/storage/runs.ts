/** Practice runs (phase 5 task 5.2). Stored runs are re-validated on every read (sanitizeRun). */
import { libraryItem } from '@core/theory/library/index';
import { duplicateRun, sanitizeRun, type PracticeRun } from '@learn/run';
import { db, newId } from './db';

const known = (itemId: string) => libraryItem(itemId) !== undefined;

export async function listRuns(): Promise<PracticeRun[]> {
  const rows = await db().runs.orderBy('updatedAt').reverse().toArray();
  return rows.map((r) => sanitizeRun(r, known)).filter((r): r is PracticeRun => r !== null);
}

export async function getRun(id: string): Promise<PracticeRun | null> {
  const row = await db().runs.get(id);
  return row ? sanitizeRun(row, known) : null;
}

/** Save (create or replace); returns the stored run. */
export async function saveRun(run: PracticeRun): Promise<PracticeRun> {
  const clean = sanitizeRun({ ...run, updatedAt: Date.now() }, known);
  if (!clean) throw new Error('A practice run needs a name.');
  await db().runs.put({ ...clean });
  return clean;
}

export async function deleteRun(id: string): Promise<void> {
  await db().runs.delete(id);
}

export async function copyRun(run: PracticeRun, name: string): Promise<PracticeRun> {
  return saveRun(duplicateRun(run, newId('run'), name));
}

export const newRunId = (): string => newId('run');
