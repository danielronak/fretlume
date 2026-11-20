/** The local attempt log (docs/specs/04-learning.md §5): IndexedDB `events`, never sent anywhere. */
import type { AttemptEvent } from '@learn/attempt';
import { db, type EventRecord } from './db';

export async function logAttempt(event: AttemptEvent): Promise<void> {
  await db().events.add({ ...event, kind: 'attempt' } as unknown as EventRecord);
}

export async function attemptsOf(sessionId: string): Promise<AttemptEvent[]> {
  const rows = await db().events.where('sessionId').equals(sessionId).sortBy('tMs');
  return rows.filter((r) => r.kind === 'attempt') as unknown as AttemptEvent[];
}

export async function recentAttempts(limit = 200): Promise<AttemptEvent[]> {
  const rows = await db()
    .events.orderBy('tMs')
    .reverse()
    .limit(limit * 2)
    .toArray();
  return rows.filter((r) => r.kind === 'attempt').slice(0, limit) as unknown as AttemptEvent[];
}
