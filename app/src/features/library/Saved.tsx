import { useState } from 'react';
import { Link } from 'react-router-dom';
import { libraryItem, type LibraryItem } from '@core/theory/library/index';
import { t } from '@i18n/index';
import type { Folder } from '@storage/db';
import {
  createFolder,
  deleteFolder,
  listFavourites,
  listFolders,
  renameFolder,
  setFavourite,
  setInFolder,
} from '@storage/library';
import { useLive } from '@storage/useLive';
import { Icon } from '@ui/icons';
import { Button, Dialog, IconButton } from '@ui/index';
import { itemPath } from './model';

const items = (ids: string[]): LibraryItem[] =>
  ids.map((id) => libraryItem(id)).filter((item): item is LibraryItem => item !== undefined);

function ItemList({ list, onRemove }: { list: LibraryItem[]; onRemove: (id: string) => void }) {
  return (
    <ul className="saved-list">
      {list.map((item) => (
        <li key={item.id} className="saved-list__item">
          <Link to={itemPath(item)}>{item.title}</Link>
          <IconButton
            label={t('savedRemove', { name: item.title })}
            onClick={() => onRemove(item.id)}
          >
            <Icon name="close" size={18} />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}

/** Favourites and folders. */
export function Saved() {
  const favourites = useLive(() => listFavourites(), [], [] as string[]);
  const folders = useLive<Folder[]>(() => listFolders(), [], []);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<Folder | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deleting, setDeleting] = useState<Folder | null>(null);

  return (
    <div className="saved" data-testid="library-saved">
      <section className="lib-section" aria-label={t('savedFavourites')}>
        <h2>{t('savedFavourites')}</h2>
        {favourites.length === 0 ? (
          <p className="lib-hint">{t('savedNoFavourites')}</p>
        ) : (
          <ItemList list={items(favourites)} onRemove={(id) => void setFavourite(id, false)} />
        )}
      </section>

      <section className="lib-section" aria-label={t('savedFolders')}>
        <h2>{t('savedFolders')}</h2>
        {folders.length === 0 ? <p className="lib-hint">{t('savedNoFolders')}</p> : null}
        {folders.map((folder) => (
          <div key={folder.id} className="saved-folder">
            <div className="saved-folder__head">
              <h3>{folder.name}</h3>
              <IconButton
                label={t('savedRename')}
                onClick={() => {
                  setRenaming(folder);
                  setRenameText(folder.name);
                }}
              >
                <Icon name="edit" size={18} />
              </IconButton>
              <IconButton label={t('savedDelete')} onClick={() => setDeleting(folder)}>
                <Icon name="trash" size={18} />
              </IconButton>
            </div>
            {folder.itemIds.length === 0 ? (
              <p className="lib-hint">{t('savedEmptyFolder')}</p>
            ) : (
              <ItemList
                list={items(folder.itemIds)}
                onRemove={(id) => void setInFolder(folder.id, id, false)}
              />
            )}
          </div>
        ))}
        <form
          className="folder-dialog__new"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            void createFolder(newName).then(() => setNewName(''));
          }}
        >
          <label htmlFor="saved-new-folder" className="visually-hidden">
            {t('folderNewLabel')}
          </label>
          <input
            id="saved-new-folder"
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
      </section>

      <Dialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title={t('savedRenameTitle')}
        actions={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!renameText.trim()}
              onClick={() => {
                if (renaming) void renameFolder(renaming.id, renameText);
                setRenaming(null);
              }}
            >
              {t('save')}
            </Button>
          </>
        }
      >
        <label htmlFor="saved-rename" className="visually-hidden">
          {t('savedRenameTitle')}
        </label>
        <input
          id="saved-rename"
          className="text-input"
          value={renameText}
          maxLength={60}
          onChange={(e) => setRenameText(e.target.value)}
        />
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('savedDeleteTitle', { name: deleting?.name ?? '' })}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleting) void deleteFolder(deleting.id);
                setDeleting(null);
              }}
            >
              {t('savedDelete')}
            </Button>
          </>
        }
      >
        {t('savedDeleteBody')}
      </Dialog>
    </div>
  );
}
