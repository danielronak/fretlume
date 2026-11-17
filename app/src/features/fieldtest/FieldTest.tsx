/**
 * Field test (phase 3 task 3.11, docs/specs/06-testing-and-data.md §4): a 10-minute checklist for
 * trying the camera on a real guitar, and the diagnostics export.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { APP_VERSION } from '@/config';
import { currentSettings } from '@/state/settings';
import { deviceInfo, diagnostics, diagnosticsFileName } from '@/diagnostics/recorder';
import { t, type MessageKey } from '@i18n/index';
import { Button, Toggle, useToast } from '@ui/index';
import '../settings/settings.css';
import './fieldtest.css';

interface Step {
  id: string;
  text: MessageKey;
  to?: string;
}

const STEPS: Step[] = [
  { id: 'lock-light', text: 'fieldLockLight', to: '/stage/chord/G/maj' },
  { id: 'lock-dim', text: 'fieldLockDim', to: '/stage/chord/G/maj' },
  { id: 'play', text: 'fieldPlay', to: '/stage/chord/C/maj' },
  { id: 'scale', text: 'fieldScale', to: '/stage/scale/A/minor-pentatonic' },
  { id: 'move', text: 'fieldMove', to: '/stage/chord/D/maj' },
  { id: 'relock', text: 'fieldRelock', to: '/stage/chord/E/min' },
  { id: 'tuner', text: 'fieldTuner', to: '/tools/tuner' },
  { id: 'export', text: 'fieldExport' },
];

const KEY = 'fretlume.fieldtest';
function loadDone(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function saveDone(done: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(done));
  } catch {
    /* private mode: the checklist simply is not remembered */
  }
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FieldTest() {
  const toast = useToast();
  const [done, setDone] = useState(loadDone);
  const [frames, setFrames] = useState(diagnostics.recordFrames);
  const toggle = (id: string, on: boolean) => {
    const next = on ? [...new Set([...done, id])] : done.filter((d) => d !== id);
    setDone(next);
    saveDone(next);
  };
  const exportNow = () => {
    const settings = currentSettings() as unknown as Record<string, unknown>;
    const bundle = diagnostics.bundle(APP_VERSION, deviceInfo(), settings);
    const name = diagnosticsFileName();
    download(name, JSON.stringify(bundle));
    toggle('export', true);
    toast.show(
      t('fieldExported', { file: name, poses: bundle.poses.length, frames: bundle.frames.length }),
    );
  };
  return (
    <section className="screen settings" data-testid="screen-field-test">
      <h1>{t('fieldTitle')}</h1>
      <p className="screen__lede">{t('fieldLede')}</p>
      <section className="settings__section" aria-label={t('fieldStepsTitle')}>
        <h2>{t('fieldStepsTitle')}</h2>
        <ol className="field__steps">
          {STEPS.map((step) => (
            <li key={step.id} className="settings__row">
              <Toggle
                label={t(step.text)}
                checked={done.includes(step.id)}
                onChange={(on) => toggle(step.id, on)}
              />
              {step.to ? (
                <Link className="btn btn--ghost" to={step.to}>
                  {t('fieldOpen')}
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
      <section className="settings__section" aria-label={t('fieldDiagTitle')}>
        <h2>{t('fieldDiagTitle')}</h2>
        <p className="settings__body">{t('fieldDiagBody')}</p>
        <Toggle
          label={t('fieldFrames')}
          checked={frames}
          onChange={(on) => {
            diagnostics.setRecordFrames(on);
            setFrames(on);
          }}
        />
        <p className="settings__body">{t('fieldFramesNote')}</p>
        <div className="settings__rows">
          <Button variant="primary" onClick={exportNow} data-testid="diagnostics-export">
            {t('fieldExportButton')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              diagnostics.clear();
              toast.show(t('fieldCleared'));
            }}
          >
            {t('fieldClear')}
          </Button>
        </div>
      </section>
    </section>
  );
}
