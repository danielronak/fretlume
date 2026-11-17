import { useEffect, useState } from 'react';
import { microphone, type MicStatus } from '@audio/microphone';
import { useMicrophone } from '@audio/useMicrophone';
import { useSettings } from '@/state/settings';
import { t, type MessageKey } from '@i18n/index';
import { Button } from '@ui/index';
import { InputMeter } from './InputMeter';

const PROBLEM: Partial<Record<MicStatus, MessageKey>> = {
  denied: 'micDenied',
  unavailable: 'micUnavailable',
  'no-device': 'micNoDevice',
  busy: 'micBusy',
  lost: 'micLost',
  error: 'micError',
};

/** Turn the microphone on, pick an input, see the level. Shared by the tuner (task 2.5). */
export function MicrophonePanel() {
  const mic = useMicrophone();
  const savedDevice = useSettings((s) => s.audioInputId);
  const update = useSettings((s) => s.update);
  const [samples, setSamples] = useState(0);

  // Expose progress for diagnostics and tests without re-rendering per block.
  useEffect(() => {
    if (mic.status !== 'running') return;
    const id = setInterval(() => setSamples(microphone.capturedSamples), 500);
    return () => clearInterval(id);
  }, [mic.status]);

  const problem = PROBLEM[mic.status];
  const running = mic.status === 'running';

  return (
    <section
      className="tool-panel"
      aria-label={t('micTitle')}
      data-testid="mic-panel"
      data-status={mic.status}
      data-captured-samples={samples}
      data-sample-rate={mic.sampleRate}
    >
      <div className="tool-panel__head">
        <h2>{t('micTitle')}</h2>
        {running ? <span className="status-pill status-pill--live">{t('micRunning')}</span> : null}
      </div>
      <p className="tool-panel__body">{t('micIntro')}</p>

      {problem ? (
        <p className="tool-panel__problem" role="alert">
          {t(problem)}
        </p>
      ) : null}

      {running ? (
        <>
          <InputMeter />
          {mic.processingOn ? <p className="tool-panel__body">{t('micProcessing')}</p> : null}
          {mic.devices.length > 0 ? (
            <div className="tool-panel__row">
              <label htmlFor="mic-device">{t('micDevice')}</label>
              <select
                id="mic-device"
                className="select"
                value={mic.deviceId}
                onChange={(e) => {
                  update({ audioInputId: e.target.value });
                  void microphone.start(e.target.value);
                }}
              >
                {mic.devices.some((d) => d.id === '') ? null : (
                  <option value="">{t('micDefault')}</option>
                )}
                {mic.devices.map((device) => (
                  <option key={device.id || 'default'} value={device.id}>
                    {device.id === '' ? t('micDefault') : device.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="row">
            <Button onClick={() => microphone.stop()}>{t('micStop')}</Button>
          </div>
        </>
      ) : (
        <div className="row">
          <Button
            variant="primary"
            disabled={mic.status === 'requesting' || mic.status === 'unavailable'}
            onClick={() => void microphone.start(savedDevice)}
          >
            {mic.status === 'requesting'
              ? t('micRequesting')
              : problem && mic.status !== 'unavailable'
                ? t('micRetry')
                : t('micStart')}
          </Button>
        </div>
      )}
    </section>
  );
}
