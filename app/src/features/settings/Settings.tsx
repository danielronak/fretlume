import { useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { APP_NAME, APP_VERSION } from '@/config';
import {
  currentSettings,
  useSettings,
  type GuitarProfileId,
  type TuningId,
} from '@/state/settings';
import { t, type MessageKey } from '@i18n/index';
import type { ColorMode, LabelMode } from '@overlay/display';
import {
  backupFileName,
  createBackup,
  parseBackup,
  restoreBackup,
  settingsAfterWipe,
  wipeAllData,
  type Backup,
  type BackupCounts,
} from '@storage/backup';
import { Button, Chip, Dialog, Toggle, useToast } from '@ui/index';
import { downloadText } from '@ui/download';
import { TUNING_OPTIONS } from '@features/tools/tuningOptions';
import './settings.css';

function Section({ title, children, body }: { title: string; body?: string; children: ReactNode }) {
  return (
    <section className="settings__section" aria-label={title}>
      <h2>{title}</h2>
      {body ? <p className="settings__body">{body}</p> : null}
      <div className="settings__rows">{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
  htmlFor,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings__row">
      {htmlFor ? (
        <label className="settings__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="settings__label">{label}</span>
      )}
      <div className="settings__control">{children}</div>
    </div>
  );
}

function ChoiceChips<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: [T, MessageKey][];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="row" role="group" aria-label={label}>
      {options.map(([option, key]) => (
        <Chip key={option} selected={value === option} onToggle={() => onChange(option)}>
          {t(key)}
        </Chip>
      ))}
    </div>
  );
}

const GUITARS: [GuitarProfileId, MessageKey][] = [
  ['steel-acoustic', 'guitarSteel'],
  ['electric', 'guitarElectric'],
  ['classical', 'guitarClassical'],
];

type Pending = {
  backup: Backup;
  counts: BackupCounts;
  settings: ReturnType<typeof currentSettings>;
};

export function Settings() {
  const settings = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);

  const exportBackup = async () => {
    const backup = await createBackup(currentSettings());
    const fileName = backupFileName();
    downloadText(fileName, JSON.stringify(backup, null, 2));
    toast.show(t('backupSaved', { file: fileName }));
  };

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    const result = parseBackup(await file.text());
    if (fileInput.current) fileInput.current.value = '';
    if (!result.ok) {
      const key: Record<typeof result.reason, MessageKey> = {
        'not-json': 'backupNotJson',
        'not-a-backup': 'backupNotBackup',
        'newer-version': 'backupNewer',
        invalid: 'backupInvalid',
      };
      toast.show(t(key[result.reason], { app: APP_NAME }), { durationMs: 8000 });
      return;
    }
    setPending({ backup: result.backup, counts: result.counts, settings: result.settings });
  };

  const confirmRestore = async () => {
    if (!pending) return;
    try {
      await restoreBackup(pending.backup);
      settings.replace({ ...pending.settings, onboarded: true });
      toast.show(t('backupRestored'));
    } catch {
      toast.show(t('backupFailed'), { durationMs: 8000 });
    }
    setPending(null);
  };

  const confirmWipe = async () => {
    await wipeAllData();
    settings.replace(settingsAfterWipe(currentSettings()));
    setWipeOpen(false);
    toast.show(t('wipeDone'));
  };

  const labelOptions: [LabelMode, MessageKey][] = [
    ['notes', 'labelNotes'],
    ['intervals', 'labelIntervals'],
    ['fingers', 'labelFingers'],
    ['none', 'labelNone'],
  ];
  const colourOptions: [ColorMode, MessageKey][] = [
    ['group', 'colourGroup'],
    ['note', 'colourNote'],
    ['degree', 'colourDegree'],
    ['finger', 'colourFinger'],
  ];

  return (
    <div className="screen settings" data-testid="screen-settings">
      <h1>{t('settingsTitle')}</h1>

      <Section title={t('settingsAppearance')}>
        <Row label={t('settingsTheme')}>
          <ChoiceChips
            label={t('settingsTheme')}
            value={settings.theme}
            options={[
              ['dark', 'settingsThemeDark'],
              ['light', 'settingsThemeLight'],
            ]}
            onChange={(theme) => settings.update({ theme })}
          />
        </Row>
      </Section>

      <Section title={t('settingsPlaying')}>
        <Row label={t('settingsHandedness')}>
          <ChoiceChips
            label={t('settingsHandedness')}
            value={settings.handedness}
            options={[
              ['right', 'settingsHandRight'],
              ['left', 'settingsHandLeft'],
            ]}
            onChange={(handedness) => settings.update({ handedness })}
          />
        </Row>
        <Row label={t('settingsMirror')}>
          <Toggle
            label={t('settingsMirror')}
            hideLabel
            checked={settings.mirrorView}
            onChange={(mirrorView) => settings.update({ mirrorView })}
          />
        </Row>
        <Row label={t('settingsGuitar')}>
          <ChoiceChips
            label={t('settingsGuitar')}
            value={settings.guitar}
            options={GUITARS}
            onChange={(guitar) => settings.update({ guitar })}
          />
        </Row>
        <Row label={t('settingsTuning')} htmlFor="settings-tuning">
          <select
            id="settings-tuning"
            className="select"
            value={settings.tuning}
            onChange={(e) => settings.update({ tuning: e.target.value as TuningId })}
          >
            {TUNING_OPTIONS.map(([id, key]) => (
              <option key={id} value={id}>
                {t(key)}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('settingsCapo')} htmlFor="settings-capo">
          <select
            id="settings-capo"
            className="select"
            value={settings.capo}
            onChange={(e) => settings.update({ capo: Number(e.target.value) })}
          >
            {Array.from({ length: 10 }, (_, n) => (
              <option key={n} value={n}>
                {n === 0 ? t('settingsCapoNone') : t('settingsCapoFret', { n })}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('settingsA4')} htmlFor="settings-a4">
          <select
            id="settings-a4"
            className="select"
            value={settings.a4Hz}
            onChange={(e) => settings.update({ a4Hz: Number(e.target.value) })}
          >
            {Array.from({ length: 21 }, (_, i) => 430 + i).map((hz) => (
              <option key={hz} value={hz}>
                {t('settingsA4Value', { hz })}
              </option>
            ))}
          </select>
        </Row>
      </Section>

      <Section title={t('settingsDiagrams')}>
        <Row label={t('settingsLabels')}>
          <ChoiceChips
            label={t('settingsLabels')}
            value={settings.labelMode}
            options={labelOptions}
            onChange={(labelMode) => settings.update({ labelMode })}
          />
        </Row>
        <Row label={t('settingsColours')}>
          <ChoiceChips
            label={t('settingsColours')}
            value={settings.colorMode}
            options={colourOptions}
            onChange={(colorMode) => settings.update({ colorMode })}
          />
        </Row>
      </Section>

      <Section title={t('settingsData')} body={t('settingsDataBody')}>
        <div className="row">
          <Button variant="primary" onClick={() => void exportBackup()}>
            {t('backupExport')}
          </Button>
          <Button onClick={() => fileInput.current?.click()}>{t('backupImport')}</Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="backup-file-input"
            onChange={(e) => void chooseFile(e.target.files?.[0])}
          />
        </div>
        <div className="row">
          <Button variant="danger" onClick={() => setWipeOpen(true)}>
            {t('wipeAction')}
          </Button>
        </div>
      </Section>

      <Section title={t('settingsAbout')}>
        <p className="settings__body">
          {APP_NAME} · {t('settingsVersion', { version: APP_VERSION })}
        </p>
        <p className="settings__body">{t('settingsLicence')}</p>
        <div className="row">
          <Link className="btn btn--secondary" to="/help">
            {t('navHelp')}
          </Link>
          <Link
            className="btn btn--secondary"
            to="/settings/field-test"
            data-testid="field-test-link"
          >
            {t('settingsFieldTest')}
          </Link>
          <Button
            variant="ghost"
            onClick={() => {
              settings.update({ onboarded: false });
              navigate('/welcome');
            }}
          >
            {t('settingsWelcomeAgain')}
          </Button>
        </div>
      </Section>

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={t('backupConfirmTitle')}
        actions={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              {t('cancel')}
            </Button>
            <Button variant="primary" onClick={() => void confirmRestore()}>
              {t('backupConfirm')}
            </Button>
          </>
        }
      >
        {pending
          ? t('backupConfirmBody', {
              date: new Date(pending.backup.exportedAt).toLocaleDateString(),
              favourites: pending.counts.favourites,
              folders: pending.counts.folders,
              runs: pending.counts.runs,
              tabs: pending.counts.tabs,
            })
          : null}
      </Dialog>

      <Dialog
        open={wipeOpen}
        onClose={() => setWipeOpen(false)}
        title={t('wipeTitle')}
        actions={
          <>
            <Button variant="ghost" onClick={() => setWipeOpen(false)}>
              {t('cancel')}
            </Button>
            <Button variant="danger" onClick={() => void confirmWipe()}>
              {t('wipeConfirm')}
            </Button>
          </>
        }
      >
        {t('wipeBody')}
      </Dialog>
    </div>
  );
}
