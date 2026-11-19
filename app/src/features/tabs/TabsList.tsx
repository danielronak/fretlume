/** /tabs: the player's tabs — new, import (file or paste), edit, play along, export (parity P-F12). */
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TabParseError } from '@core/tab/ascii';
import { newTab, type Tab } from '@core/tab/model';
import { t, type MessageKey } from '@i18n/index';
import { copyTab, deleteTab, listTabs, newTabId, saveTab } from '@storage/tabs';
import { useLive } from '@storage/useLive';
import { Button, Dialog, useToast } from '@ui/index';
import type { ImportedTrack } from './import/alphatab';
import type { ImportResult } from './import/importTab';
import './tabs.css';

const ACCEPT =
  '.gp,.gp3,.gp4,.gp5,.gpx,.xml,.musicxml,.mxl,.txt,.tab,.cho,.chopro,.chordpro,.crd,.json,text/plain,application/json';

const ERRORS: Record<TabParseError['code'], MessageKey> = {
  noTab: 'tabsErrorNoTab',
  noChords: 'tabsErrorNoChords',
  unreadable: 'tabsErrorUnreadable',
  noTracks: 'tabsErrorNoTracks',
  tooBig: 'tabsErrorTooBig',
};

export function importErrorText(error: unknown): string {
  return t(error instanceof TabParseError ? ERRORS[error.code] : 'tabsErrorUnreadable');
}

export function tabSummary(tab: Tab): string {
  return t('tabsSummary', {
    bars: tab.tracks[0]?.bars.length ?? 0,
    tempo: tab.tempoBpm,
    time: `${tab.timeSig[0]}/${tab.timeSig[1]}`,
  });
}

export function TabsList() {
  const tabs = useLive<Tab[]>(() => listTabs(), [], []);
  const navigate = useNavigate();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState<Tab | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [choices, setChoices] = useState<ImportResult | null>(null);

  async function keep(track: ImportedTrack, result: ImportResult) {
    const saved = await saveTab(track.tab);
    toast.show(
      t(result.format === 'chordpro' ? 'tabsImportedChords' : 'tabsImported', {
        name: saved.title,
      }),
    );
    navigate(`/tabs/${saved.id}`);
  }

  async function handle(result: ImportResult) {
    if (result.tracks.length === 1) await keep(result.tracks[0]!, result);
    else setChoices(result);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      const { importTabFile } = await import('./import/importTab');
      const bytes = new Uint8Array(await file.arrayBuffer());
      await handle(await importTabFile(file.name, bytes, newTabId()));
    } catch (error) {
      toast.show(importErrorText(error), { durationMs: 8000 });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function importPaste() {
    try {
      const { importTabText } = await import('./import/importTab');
      const result = importTabText(pasteText, newTabId());
      setPasteOpen(false);
      setPasteText('');
      setPasteError('');
      await handle(result);
    } catch (error) {
      setPasteError(importErrorText(error));
    }
  }

  return (
    <div className="screen tabs" data-testid="screen-tabs">
      <h1>{t('tabsTitle')}</h1>
      <p className="screen__lede">{t('tabsIntro')}</p>
      <div className="tabs__actions">
        <Button
          variant="primary"
          data-testid="tabs-new"
          onClick={() =>
            void saveTab(newTab(newTabId(), t('tabsNewTitle'))).then((tab) =>
              navigate(`/tabs/${tab.id}`),
            )
          }
        >
          {t('tabsNew')}
        </Button>
        <Button onClick={() => fileInput.current?.click()} data-testid="tabs-import">
          {t('tabsImportFile')}
        </Button>
        <Button onClick={() => setPasteOpen(true)} data-testid="tabs-paste">
          {t('tabsPaste')}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="tabs-file-input"
          onChange={(e) => void importFile(e.target.files?.[0])}
        />
      </div>

      {tabs.length === 0 ? (
        <p className="lib-hint">{t('tabsEmpty')}</p>
      ) : (
        <ul className="tabs__list">
          {tabs.map((tab) => (
            <li key={tab.id} className="tabs__item" data-testid="tab-item">
              <div className="tabs__name">
                <strong>{tab.title}</strong>
                <span className="tabs__meta">{tabSummary(tab)}</span>
              </div>
              <div className="tabs__buttons">
                <Link className="btn btn--primary" to={`/tabs/${tab.id}`} data-testid="tab-open">
                  {t('tabsOpen')}
                </Link>
                <Link className="btn btn--secondary" to={`/stage/tab/${tab.id}`}>
                  {t('tabsPlayAlong')}
                </Link>
                <Button
                  variant="ghost"
                  onClick={() => void copyTab(tab, t('tabsCopyName', { name: tab.title }))}
                >
                  {t('tabsDuplicate')}
                </Button>
                <Button variant="ghost" onClick={() => setDeleting(tab)}>
                  {t('tabsDelete')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title={t('tabsPasteTitle')}
        actions={
          <>
            <Button variant="ghost" onClick={() => setPasteOpen(false)}>
              {t('tabsCancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!pasteText.trim()}
              onClick={() => void importPaste()}
              data-testid="tabs-paste-import"
            >
              {t('tabsPasteImport')}
            </Button>
          </>
        }
      >
        <label className="tabs__paste">
          <span>{t('tabsPasteHint')}</span>
          <textarea
            aria-label={t('tabsPasteLabel')}
            rows={10}
            spellCheck={false}
            value={pasteText}
            data-testid="tabs-paste-text"
            onChange={(e) => setPasteText(e.target.value)}
          />
        </label>
        {pasteError ? (
          <p className="tabs__error" role="alert">
            {pasteError}
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={choices !== null}
        onClose={() => setChoices(null)}
        title={t('tabsPickTrack')}
        actions={
          <Button variant="ghost" onClick={() => setChoices(null)}>
            {t('tabsCancel')}
          </Button>
        }
      >
        <p>{t('tabsPickTrackBody')}</p>
        <div className="tabs__tracks">
          {choices?.tracks.map((track, i) => (
            <Button
              key={i}
              data-testid="tabs-track"
              onClick={() => {
                const result = choices;
                setChoices(null);
                void keep(track, result);
              }}
            >
              {track.name}
            </Button>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={deleting ? t('tabsDeleteConfirm', { name: deleting.title }) : ''}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {t('tabsCancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!deleting) return;
                void deleteTab(deleting.id);
                toast.show(t('tabsDeleted', { name: deleting.title }));
                setDeleting(null);
              }}
            >
              {t('tabsDelete')}
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </div>
  );
}
