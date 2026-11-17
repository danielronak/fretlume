import { useState } from 'react';
import { t } from '@i18n/index';
import {
  createFolder,
  isFavourite,
  listFolders,
  setFavourite,
  setInFolder,
} from '@storage/library';
import { useLive } from '@storage/useLive';
import { Icon } from '@ui/icons';
import { Button, Dialog, IconButton, useToast } from '@ui/index';
import type { Folder } from '@storage/db';

/** Heart toggle for a library item. */
export function FavouriteButton({ itemId, name }: { itemId: string; name: string }) {
  const favourite = useLive(() => isFavourite(itemId), [itemId], false);
  const toast = useToast();
  return (
    <IconButton
      label={favourite ? t('favouriteRemove') : t('favouriteAdd')}
      aria-pressed={favourite}
      className={favourite ? 'is-favourite' : ''}
      data-testid="favourite-toggle"
      onClick={() => {
        void setFavourite(itemId, !favourite);
        if (!favourite) toast.show(t('favouriteAdded', { name }));
      }}
    >
      <Icon name={favourite ? 'heartFilled' : 'heart'} />
    </IconButton>
  );
}

/** Opens a dialog to add or remove the item from folders, or start a new one. */
export function FolderButton({ itemId, name }: { itemId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const folders = useLive<Folder[]>(() => listFolders(), [], []);

  const create = async () => {
    if (!newName.trim()) return;
    await createFolder(newName, [itemId]);
    setNewName('');
  };

  return (
    <>
      <IconButton label={t('folderAdd')} onClick={() => setOpen(true)}>
        <Icon name="folder" />
      </IconButton>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('folderDialogTitle', { name })}
        actions={
          <Button variant="primary" onClick={() => setOpen(false)}>
            {t('folderDone')}
          </Button>
        }
      >
        <div className="folder-dialog">
          {folders.length === 0 ? <p>{t('folderEmpty')}</p> : null}
          <ul className="folder-dialog__list">
            {folders.map((folder) => {
              const inFolder = folder.itemIds.includes(itemId);
              return (
                <li key={folder.id}>
                  <label className="folder-dialog__row">
                    <input
                      type="checkbox"
                      checked={inFolder}
                      onChange={() => void setInFolder(folder.id, itemId, !inFolder)}
                    />
                    <span>{folder.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <form
            className="folder-dialog__new"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <label htmlFor="folder-new" className="visually-hidden">
              {t('folderNewLabel')}
            </label>
            <input
              id="folder-new"
              className="text-input"
              placeholder={t('folderNewPlaceholder')}
              value={newName}
              maxLength={60}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button type="submit" disabled={!newName.trim()}>
              {t('folderCreate')}
            </Button>
          </form>
        </div>
      </Dialog>
    </>
  );
}
