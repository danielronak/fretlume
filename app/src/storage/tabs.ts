/** Tabs (phase 5 task 5.5). Stored tabs are re-validated on every read (sanitizeTab). */
import type { Tab } from '@core/tab/model';
import { sanitizeTab } from '@core/tab/sanitize';
import { db, newId, type TabRecord } from './db';

export async function listTabs(): Promise<Tab[]> {
  const rows = await db().tabs.orderBy('updatedAt').reverse().toArray();
  return rows.map((r) => sanitizeTab(r)).filter((t): t is Tab => t !== null);
}

export async function getTab(id: string): Promise<Tab | null> {
  const row = await db().tabs.get(id);
  return row ? sanitizeTab(row) : null;
}

/** Save (create or replace); returns the stored tab. */
export async function saveTab(tab: Tab): Promise<Tab> {
  const clean = sanitizeTab({ ...tab, updatedAt: Date.now() });
  if (!clean) throw new Error('This tab cannot be saved.');
  await db().tabs.put(clean as unknown as TabRecord);
  return clean;
}

export async function deleteTab(id: string): Promise<void> {
  await db().tabs.delete(id);
}

export const newTabId = (): string => newId('tab');

export async function copyTab(tab: Tab, title: string): Promise<Tab> {
  return saveTab({ ...structuredClone(tab), id: newTabId(), title });
}
