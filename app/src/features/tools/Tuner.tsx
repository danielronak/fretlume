import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettings, type TuningId } from '@/state/settings';
import { microphone } from '@audio/microphone';
import { playMidi } from '@audio/player';
import { IN_TUNE_CENTS, tunerTargets, type TunerMode } from '@audio/tuner';
import { useMicrophone } from '@audio/useMicrophone';
import { useTuner } from '@audio/useTuner';
import { TUNINGS } from '@core/theory/tuning';
import { t, type MessageKey } from '@i18n/index';
import { Icon } from '@ui/icons';
import { Button, Chip } from '@ui/index';
import { MicrophonePanel } from './MicrophonePanel';
import { TUNING_OPTIONS } from './tuningOptions';
import './tools.css';

const METER_RANGE = 50;

function CentsMeter({
  cents,
  inTune,
  active,
}: {
  cents: number;
  inTune: boolean;
  active: boolean;
}) {
  const clamped = Math.max(-METER_RANGE, Math.min(METER_RANGE, cents));
  const left = 50 + (clamped / METER_RANGE) * 50;
  return (
    <div className="cents" data-active={active} data-in-tune={inTune} aria-hidden="true">
      <div className="cents__labels">
        <span>{t('tunerFlatLabel')}</span>
        <span>0</span>
        <span>{t('tunerSharpLabel')}</span>
      </div>
      <div className="cents__track">
        <div className="cents__zone" style={{ width: `${(IN_TUNE_CENTS / METER_RANGE) * 100}%` }} />
        {[-40, -30, -20, -10, 0, 10, 20, 30, 40].map((tick) => (
          <span
            key={tick}
            className={`cents__tick${tick === 0 ? ' cents__tick--zero' : ''}`}
            style={{ left: `${50 + tick}%` }}
          />
        ))}
        {active ? <div className="cents__needle" style={{ left: `${left}%` }} /> : null}
      </div>
      <div className="cents__scale tabular">
        <span>−50</span>
        <span>+50</span>
      </div>
    </div>
  );
}

export function Tuner() {
  const settings = useSettings();
  const mic = useMicrophone();
  const tuning = TUNINGS[settings.tuning];
  const targets = useMemo(() => tunerTargets(tuning, settings.a4Hz), [tuning, settings.a4Hz]);
  const [guidedIndex, setGuidedIndex] = useState(0);
  const [tuned, setTuned] = useState<Set<number>>(new Set());
  const guided = settings.tunerGuided;
  const guidedTarget = targets[Math.min(guidedIndex, targets.length - 1)]!;
  const mode: TunerMode = guided
    ? { kind: 'guided', string: guidedTarget.string }
    : { kind: 'auto' };
  const { reading, inTune, held } = useTuner(tuning, settings.a4Hz, mode);
  const allDone = guided && guidedIndex >= targets.length;

  // A string held in tune is ticked off.
  useEffect(() => {
    if (!held || !reading) return;
    const string = reading.target.string;
    setTuned((previous) => (previous.has(string) ? previous : new Set(previous).add(string)));
  }, [held, reading]);

  // In guided mode, once the current string is ticked off, move to the next one shortly after.
  // (Depends only on the tick, so new readings from the still-ringing string do not cancel it.)
  const currentTicked = guided && tuned.has(guidedTarget.string);
  useEffect(() => {
    if (!currentTicked) return;
    const id = setTimeout(() => setGuidedIndex((i) => i + 1), 900);
    return () => clearTimeout(id);
  }, [currentTicked, guidedIndex]);

  useEffect(() => {
    setTuned(new Set());
    setGuidedIndex(0);
  }, [settings.tuning, settings.a4Hz, guided]);

  const running = mic.status === 'running';
  const shown = reading?.range === 'ok' ? reading : null;
  const displayTarget = guided ? guidedTarget : (shown?.target ?? null);
  let advice: MessageKey | null = null;
  if (reading?.range === 'above') advice = 'tunerAbove';
  else if (reading?.range === 'below') advice = 'tunerBelow';
  else if (shown) {
    advice = inTune
      ? 'tunerInTune'
      : Math.abs(shown.cents) <= 8
        ? 'tunerClose'
        : shown.cents < 0
          ? 'tunerFlat'
          : 'tunerSharp';
  }

  return (
    <div className="screen tools tuner" data-testid="screen-tuner">
      <div className="tool-header">
        <Link to="/tools" className="tool-header__back">
          {t('toolsTitle')}
        </Link>
        <h1>{t('tunerTitle')}</h1>
      </div>

      <div className="tuner__options">
        <label className="field-inline">
          <span>{t('tunerTuning')}</span>
          <select
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
        </label>
        <label className="field-inline">
          <span>{t('tunerA4')}</span>
          <select
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
        </label>
        <div className="row" role="group" aria-label={t('tunerModeLabel')}>
          <Chip selected={!guided} onToggle={() => settings.update({ tunerGuided: false })}>
            {t('tunerModeAuto')}
          </Chip>
          <Chip selected={guided} onToggle={() => settings.update({ tunerGuided: true })}>
            {t('tunerModeGuided')}
          </Chip>
        </div>
      </div>

      <ol className="tuner__strings" aria-label={t('tunerStrings')}>
        {targets.map((target, index) => {
          const isTarget = displayTarget?.string === target.string;
          return (
            <li
              key={target.string}
              className="tuner-string"
              data-target={isTarget}
              data-tuned={tuned.has(target.string)}
            >
              <button
                type="button"
                className="tuner-string__choose"
                aria-pressed={guided ? guidedIndex === index : undefined}
                aria-label={t('tunerChoose', { note: target.name })}
                onClick={() => {
                  if (!guided) settings.update({ tunerGuided: true });
                  // Re-checking a string starts it afresh.
                  setTuned((previous) => {
                    const next = new Set(previous);
                    next.delete(target.string);
                    return next;
                  });
                  setGuidedIndex(index);
                }}
              >
                <span className="tuner-string__note">{target.name.replace(/\d+$/, '')}</span>
                <span className="tuner-string__octave">{target.name.match(/\d+$/)?.[0]}</span>
                <span className="tuner-string__number">
                  {t('tunerStringNumber', { n: target.string })}
                </span>
                {tuned.has(target.string) ? (
                  <span className="tuner-string__tick">{t('tunerTuned')}</span>
                ) : null}
              </button>
              <button
                type="button"
                className="icon-btn tuner-string__hear"
                aria-label={t('tunerHear', { note: target.name })}
                title={t('tunerHear', { note: target.name })}
                onClick={() => void playMidi(target.midi, settings.a4Hz)}
              >
                <Icon name="play" size={18} />
              </button>
            </li>
          );
        })}
      </ol>

      {running ? (
        <section
          className="tuner__display"
          data-testid="tuner-display"
          data-target={shown?.target.name ?? ''}
          data-cents={shown ? shown.cents.toFixed(1) : ''}
          data-in-tune={inTune}
          aria-live="polite"
        >
          {allDone ? (
            <>
              <p className="tuner__big">{t('tunerAllDone')}</p>
              <Button variant="primary" onClick={() => setGuidedIndex(0)}>
                {t('tunerRestart')}
              </Button>
            </>
          ) : (
            <>
              <div className="tuner__note">
                <span className="tuner__note-name">
                  {displayTarget?.name.replace(/\d+$/, '') ?? '–'}
                </span>
                <span className="tuner__note-octave">{displayTarget?.name.match(/\d+$/)?.[0]}</span>
              </div>
              <CentsMeter cents={shown?.cents ?? 0} inTune={inTune} active={shown !== null} />
              <div className="tuner__readout tabular">
                <span>
                  {shown
                    ? t('tunerCents', {
                        cents: `${shown.cents > 0 ? '+' : ''}${shown.cents.toFixed(0)}`,
                      })
                    : ' '}
                </span>
                <span>{reading ? t('tunerHz', { hz: reading.fHz.toFixed(1) }) : ' '}</span>
              </div>
              <p
                className="tuner__advice"
                data-testid="tuner-advice"
                data-tone={inTune ? 'good' : 'neutral'}
              >
                {advice
                  ? t(advice)
                  : guided
                    ? t('tunerPlayString', { note: guidedTarget.name, n: guidedTarget.string })
                    : t('tunerPlayAny')}
              </p>
            </>
          )}
          <div className="tuner__mic">
            <span className="status-pill status-pill--live">{t('tunerMicOn')}</span>
            <Button variant="ghost" onClick={() => microphone.stop()}>
              {t('micStop')}
            </Button>
          </div>
        </section>
      ) : (
        <MicrophonePanel />
      )}
    </div>
  );
}
