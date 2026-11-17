/**
 * Backup files: everything the player made, in one versioned JSON file they keep themselves.
 * Import replaces what is on this device after the player confirms. Nothing is uploaded anywhere.
 */
import { z } from 'zod';
import { APP_VERSION } from '@/config';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '@/state/settings';
import { db, TABLE_NAMES, type TableName } from './db';

export const BACKUP_FORMAT = 'fretlume-backup';
export const BACKUP_VERSION = 1;

const id = z.string().min(1).max(200);
const time = z.number().finite();
const open = <T extends z.ZodRawShape>(shape: T) => z.looseObject(shape);

const tableSchemas = {
  favourites: z.object({ id, addedAt: time }),
  folders: z.object({
    id,
    name: z.string().min(1).max(200),
    createdAt: time,
    itemIds: z.array(id).max(5000),
  }),
  runs: open({ id, name: z.string().max(200), updatedAt: time }),
  tabs: open({ id, title: z.string().max(300), updatedAt: time }),
  events: open({ seq: z.number().int().optional(), tMs: time, sessionId: z.string().max(200) }),
  skills: open({ id }),
  profiles: open({ id, name: z.string().max(200) }),
} satisfies Record<TableName, z.ZodType>;

const MAX_ROWS = 200_000;

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  appVersion: z.string(),
  settings: z.record(z.string(), z.unknown()),
  data: z.object({
    favourites: z.array(tableSchemas.favourites).max(MAX_ROWS),
    folders: z.array(tableSchemas.folders).max(MAX_ROWS),
    runs: z.array(tableSchemas.runs).max(MAX_ROWS),
    tabs: z.array(tableSchemas.tabs).max(MAX_ROWS),
    events: z.array(tableSchemas.events).max(MAX_ROWS),
    skills: z.array(tableSchemas.skills).max(MAX_ROWS),
    profiles: z.array(tableSchemas.profiles).max(MAX_ROWS),
  }),
});

export type Backup = z.infer<typeof backupSchema>;
export type BackupCounts = Record<TableName, number>;

export async function createBackup(settings: Settings, now = new Date()): Promise<Backup> {
  const database = db();
  const data = Object.fromEntries(
    await Promise.all(
      TABLE_NAMES.map(async (name) => [name, await database.table(name).toArray()]),
    ),
  ) as Backup['data'];
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    appVersion: APP_VERSION,
    settings: { ...settings },
    data,
  };
}

export function backupFileName(now = new Date()): string {
  return `fretlume-backup-${now.toISOString().slice(0, 10)}.json`;
}

export function countRows(data: Backup['data']): BackupCounts {
  return Object.fromEntries(TABLE_NAMES.map((name) => [name, data[name].length])) as BackupCounts;
}

export type ParseResult =
  | { ok: true; backup: Backup; counts: BackupCounts; settings: Settings }
  | { ok: false; reason: 'not-json' | 'not-a-backup' | 'newer-version' | 'invalid' };

/** Check a file's text before anything is changed. */
export function parseBackup(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (
    !json ||
    typeof json !== 'object' ||
    (json as { format?: unknown }).format !== BACKUP_FORMAT
  ) {
    return { ok: false, reason: 'not-a-backup' };
  }
  const version = (json as { version?: unknown }).version;
  if (typeof version === 'number' && version > BACKUP_VERSION) {
    return { ok: false, reason: 'newer-version' };
  }
  const result = backupSchema.safeParse(json);
  if (!result.success) return { ok: false, reason: 'invalid' };
  return {
    ok: true,
    backup: result.data,
    counts: countRows(result.data.data),
    settings: sanitizeSettings(result.data.settings),
  };
}

/** Replace all local data with the backup's, in one transaction (all or nothing). */
export async function restoreBackup(backup: Backup): Promise<void> {
  const database = db();
  await database.transaction(
    'rw',
    TABLE_NAMES.map((name) => database.table(name)),
    async () => {
      for (const name of TABLE_NAMES) {
        const table = database.table(name);
        await table.clear();
        await table.bulkAdd(backup.data[name] as never[]);
      }
    },
  );
}

/** Delete everything the player created. Settings are reset by the caller. */
export async function wipeAllData(): Promise<void> {
  const database = db();
  await database.transaction(
    'rw',
    TABLE_NAMES.map((name) => database.table(name)),
    async () => {
      for (const name of TABLE_NAMES) await database.table(name).clear();
    },
  );
}

/** Settings after "Delete all my data": defaults, but keep the theme and skip the welcome. */
export function settingsAfterWipe(current: Settings): Settings {
  return { ...DEFAULT_SETTINGS, theme: current.theme, onboarded: true };
}
