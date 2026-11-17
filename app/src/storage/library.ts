/** Favourites and folders. */
import { db, newId, type Folder } from './db';

export async function isFavourite(itemId: string): Promise<boolean> {
  return (await db().favourites.get(itemId)) !== undefined;
}

export async function setFavourite(itemId: string, favourite: boolean): Promise<void> {
  if (favourite) await db().favourites.put({ id: itemId, addedAt: Date.now() });
  else await db().favourites.delete(itemId);
}

export async function listFavourites(): Promise<string[]> {
  return (await db().favourites.orderBy('addedAt').reverse().toArray()).map((f) => f.id);
}

export async function createFolder(name: string, itemIds: string[] = []): Promise<Folder> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('A folder needs a name.');
  const folder: Folder = { id: newId('folder'), name: trimmed, createdAt: Date.now(), itemIds };
  await db().folders.add(folder);
  return folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('A folder needs a name.');
  await db().folders.update(id, { name: trimmed });
}

export async function deleteFolder(id: string): Promise<void> {
  await db().folders.delete(id);
}

export async function listFolders(): Promise<Folder[]> {
  return db().folders.orderBy('createdAt').toArray();
}

/** Add or remove an item; adding twice keeps one entry. */
export async function setInFolder(
  folderId: string,
  itemId: string,
  inFolder: boolean,
): Promise<void> {
  await db().transaction('rw', db().folders, async () => {
    const folder = await db().folders.get(folderId);
    if (!folder) throw new Error('That folder no longer exists.');
    const without = folder.itemIds.filter((id) => id !== itemId);
    await db().folders.update(folderId, { itemIds: inFolder ? [...without, itemId] : without });
  });
}
