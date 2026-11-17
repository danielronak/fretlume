import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/state/settings';
import {
  backupFileName,
  createBackup,
  parseBackup,
  restoreBackup,
  settingsAfterWipe,
  wipeAllData,
} from './backup';
import { db, FretlumeDB, SCHEMA_VERSIONS, TABLE_NAMES, useDatabaseForTests } from './db';
import {
  createFolder,
  deleteFolder,
  isFavourite,
  listFavourites,
  listFolders,
  renameFolder,
  setFavourite,
  setInFolder,
} from './library';

let n = 0;
beforeEach(() => {
  useDatabaseForTests(new FretlumeDB(`test-${++n}`));
});
afterEach(async () => {
  await db().delete();
});

describe('schema', () => {
  it('declares strictly increasing versions that each list every table', () => {
    let previous = 0;
    for (const schema of SCHEMA_VERSIONS) {
      expect(schema.version).toBeGreaterThan(previous);
      previous = schema.version;
      expect(Object.keys(schema.stores).sort()).toEqual([...TABLE_NAMES].sort());
    }
  });

  it('opens an empty database with every table', async () => {
    await db().open();
    expect(
      db()
        .tables.map((t) => t.name)
        .sort(),
    ).toEqual([...TABLE_NAMES].sort());
    expect(db().verno).toBe(SCHEMA_VERSIONS.at(-1)!.version);
  });

  it('keeps data written by an older copy of the same schema when reopened', async () => {
    const name = `migrate-${n}`;
    const v1 = new Dexie(name);
    v1.version(1).stores(SCHEMA_VERSIONS[0]!.stores);
    await v1.table('favourites').add({ id: 'chord-0-maj', addedAt: 1 });
    await v1
      .table('folders')
      .add({ id: 'f1', name: 'Warm-ups', createdAt: 2, itemIds: ['scale-9-minor-pentatonic'] });
    v1.close();

    const current = new FretlumeDB(name);
    expect(await current.favourites.get('chord-0-maj')).toEqual({ id: 'chord-0-maj', addedAt: 1 });
    expect((await current.folders.get('f1'))?.itemIds).toEqual(['scale-9-minor-pentatonic']);
    await current.delete();
  });
});

describe('favourites and folders', () => {
  it('adds and removes favourites, newest first', async () => {
    await setFavourite('chord-0-maj', true);
    await new Promise((r) => setTimeout(r, 2));
    await setFavourite('scale-9-minor-pentatonic', true);
    expect(await listFavourites()).toEqual(['scale-9-minor-pentatonic', 'chord-0-maj']);
    await setFavourite('chord-0-maj', false);
    expect(await isFavourite('chord-0-maj')).toBe(false);
  });

  it('creates, fills, renames and deletes folders', async () => {
    const folder = await createFolder('  Campfire  ');
    expect(folder.name).toBe('Campfire');
    await setInFolder(folder.id, 'chord-7-maj', true);
    await setInFolder(folder.id, 'chord-0-maj', true);
    await setInFolder(folder.id, 'chord-7-maj', true); // no duplicates
    expect((await listFolders())[0]!.itemIds).toEqual(['chord-0-maj', 'chord-7-maj']);
    await setInFolder(folder.id, 'chord-0-maj', false);
    await renameFolder(folder.id, 'Songs');
    expect(await listFolders()).toMatchObject([{ name: 'Songs', itemIds: ['chord-7-maj'] }]);
    await deleteFolder(folder.id);
    expect(await listFolders()).toEqual([]);
  });

  it('refuses empty names and missing folders', async () => {
    await expect(createFolder('   ')).rejects.toThrow();
    await expect(setInFolder('nope', 'chord-0-maj', true)).rejects.toThrow();
  });
});

describe('backup', () => {
  it('round-trips everything through a file and replaces local data', async () => {
    await setFavourite('chord-0-maj', true);
    const folder = await createFolder('Warm-ups', ['scale-9-minor-pentatonic']);
    await db().events.add({ tMs: 5, sessionId: 's1', verdict: 'ok' });
    const settings = { ...DEFAULT_SETTINGS, handedness: 'left' as const, onboarded: true };
    const text = JSON.stringify(await createBackup(settings, new Date('2026-11-17T10:00:00Z')));

    await wipeAllData();
    await setFavourite('chord-2-min', true); // something that the restore must replace
    expect(await listFavourites()).toEqual(['chord-2-min']);

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.counts).toMatchObject({ favourites: 1, folders: 1, events: 1, runs: 0 });
    expect(parsed.settings.handedness).toBe('left');
    await restoreBackup(parsed.backup);

    expect(await listFavourites()).toEqual(['chord-0-maj']);
    expect(await listFolders()).toEqual([folder]);
    expect(await db().events.toArray()).toMatchObject([{ tMs: 5, sessionId: 's1', verdict: 'ok' }]);
  });

  it('rejects files that are not backups, are damaged, or come from a newer app', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, reason: 'not-json' });
    expect(parseBackup('{"hello":1}')).toEqual({ ok: false, reason: 'not-a-backup' });
    expect(parseBackup(JSON.stringify({ format: 'fretlume-backup', version: 99 }))).toEqual({
      ok: false,
      reason: 'newer-version',
    });
    const damaged = {
      format: 'fretlume-backup',
      version: 1,
      exportedAt: 'x',
      appVersion: '0',
      settings: {},
      data: {
        favourites: [{ id: 3 }],
        folders: [],
        runs: [],
        tabs: [],
        events: [],
        skills: [],
        profiles: [],
      },
    };
    expect(parseBackup(JSON.stringify(damaged))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('names files by date and resets settings sensibly after a wipe', () => {
    expect(backupFileName(new Date('2026-11-17T23:00:00Z'))).toBe(
      'fretlume-backup-2026-11-17.json',
    );
    const after = settingsAfterWipe({
      ...DEFAULT_SETTINGS,
      theme: 'light',
      handedness: 'left',
      onboarded: true,
    });
    expect(after).toEqual({ ...DEFAULT_SETTINGS, theme: 'light', onboarded: true });
  });
});
