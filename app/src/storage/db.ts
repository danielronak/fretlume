/**
 * Local database (docs/phases/phase-02-shell-library-tuner.md task 2.2).
 * Everything the player creates lives here, on this device only. Settings are separate
 * (localStorage, see state/settings.ts and DECISIONS D-012).
 *
 * Schema changes: add a new entry to SCHEMA_VERSIONS with the full table list and, if data must
 * change shape, an `upgrade` function. Never edit a version that has shipped.
 */
import Dexie, { type Table, type Transaction } from 'dexie';
import { STORAGE_PREFIX } from '@/config';

/** A saved library item; `id` is the library item id ("chord-0-maj7"). */
export interface Favourite {
  id: string;
  addedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  /** Library item ids, in the order the player arranged them. */
  itemIds: string[];
}

/** Records whose shape is defined by later phases. Only `id` and `updatedAt` are fixed now. */
export interface PracticeRunRecord {
  id: string;
  name: string;
  updatedAt: number;
  [key: string]: unknown;
}
export interface TabRecord {
  id: string;
  title: string;
  updatedAt: number;
  [key: string]: unknown;
}
export interface EventRecord {
  seq?: number;
  tMs: number;
  sessionId: string;
  [key: string]: unknown;
}
export interface SkillRecord {
  id: string;
  [key: string]: unknown;
}
export interface GuitarProfileRecord {
  id: string;
  name: string;
  [key: string]: unknown;
}

export const TABLE_NAMES = [
  'favourites',
  'folders',
  'runs',
  'tabs',
  'events',
  'skills',
  'profiles',
] as const;
export type TableName = (typeof TABLE_NAMES)[number];

interface SchemaVersion {
  version: number;
  stores: Record<TableName, string>;
  upgrade?: (tx: Transaction) => Promise<void> | void;
}

export const SCHEMA_VERSIONS: SchemaVersion[] = [
  {
    version: 1,
    stores: {
      favourites: 'id, addedAt',
      folders: 'id, name, createdAt',
      runs: 'id, name, updatedAt',
      tabs: 'id, title, updatedAt',
      events: '++seq, tMs, sessionId',
      skills: 'id',
      profiles: 'id, name',
    },
  },
];

export const DB_NAME = `${STORAGE_PREFIX}`;

export class FretlumeDB extends Dexie {
  favourites!: Table<Favourite, string>;
  folders!: Table<Folder, string>;
  runs!: Table<PracticeRunRecord, string>;
  tabs!: Table<TabRecord, string>;
  events!: Table<EventRecord, number>;
  skills!: Table<SkillRecord, string>;
  profiles!: Table<GuitarProfileRecord, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    for (const schema of SCHEMA_VERSIONS) {
      const version = this.version(schema.version).stores(schema.stores);
      if (schema.upgrade) version.upgrade(schema.upgrade);
    }
  }
}

let instance: FretlumeDB | null = null;

/** The app's database, opened lazily. */
export function db(): FretlumeDB {
  instance ??= new FretlumeDB();
  return instance;
}

/** Tests only: point the app at a fresh database. */
export function useDatabaseForTests(next: FretlumeDB): void {
  instance = next;
}

export function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}
