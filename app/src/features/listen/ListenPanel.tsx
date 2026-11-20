/** Listening controls and feedback for a deck (phase 6 task 6.5): toggle, level, coach line, checks. */
import { t, type MessageKey } from '@i18n/index';
import { Button, Toggle } from '@ui/index';
import type { Listening } from './useListening';
import './listen.css';

const MIC_PROBLEM: Partial<Record<string, MessageKey>> = {
  denied: 'micDenied',
  unavailable: 'micUnavailable',
  'no-device': 'micNoDevice',
  busy: 'micBusy',
  lost: 'micLost',
  error: 'micError',
};

export function ListenPanel({
  listening: l,
  waitMode,
  onWaitMode,
  onMarkPlayed,
  canCheck,
  unsupported,
}: {
  listening: Listening;
  waitMode?: boolean;
  onWaitMode?: (on: boolean) => void;
  onMarkPlayed?: () => void;
  /** Offer the string-by-string check (chords). */
  canCheck?: boolean;
  /** Why this step cannot be judged (e.g. a whole scale), if so. */
  unsupported?: MessageKey | null;
}) {
  const problem = l.on ? MIC_PROBLEM[l.mic] : undefined;
  const levelPct = Math.min(100, Math.round(Math.sqrt(l.level) * 400));
  return (
    <div className="listen" data-testid="listen-panel" data-on={l.on}>
      <div className="listen__row">
        <Toggle label={t('listenToggle')} checked={l.on} onChange={() => l.toggle()} />
        {l.on && l.mic === 'running' ? (
          <span className="listen__level" aria-label={t('micLevel')} title={t('micLevel')}>
            <span style={{ width: `${levelPct}%` }} />
          </span>
        ) : null}
        {l.on && onWaitMode ? (
          <Toggle label={t('listenWaitMode')} checked={!!waitMode} onChange={onWaitMode} />
        ) : null}
        {l.on && onMarkPlayed ? (
          <Button variant="ghost" onClick={onMarkPlayed} data-testid="listen-mark-played">
            {t('listenMarkPlayed')}
          </Button>
        ) : null}
      </div>
      {problem ? (
        <p className="listen__problem" role="alert">
          {t(problem)}
        </p>
      ) : null}
      {l.on && unsupported ? <p className="listen__hint">{t(unsupported)}</p> : null}
      {l.on && l.mic === 'requesting' ? <p className="listen__hint">{t('micRequesting')}</p> : null}
      {l.check ? (
        <div className="listen__check" data-testid="listen-check">
          <p>
            {l.check.queue[0]
              ? t('listenCheckPlay', { string: l.check.queue[0].notes[0]!.string })
              : t('listenCheckDone')}
          </p>
          {l.coach?.key === 'listenOneString' ? (
            <p className="listen__hint">{t('listenOneString')}</p>
          ) : null}
          <ol className="listen__strings">
            {l.check.results.map((r) => (
              <li key={r.string} className={r.ok ? 'is-good' : 'is-fix'}>
                {t(r.ok ? 'listenCheckRings' : 'listenCheckNot', { string: r.string })}
              </li>
            ))}
          </ol>
          <Button variant="ghost" onClick={l.stopStringCheck}>
            {t('listenCheckClose')}
          </Button>
        </div>
      ) : l.on && l.coach ? (
        <p className={`listen__coach is-${l.coach.tone}`} role="status" data-testid="listen-coach">
          {t(l.coach.key, l.coach.params)}
          {canCheck && l.coach.suggestStringCheck ? (
            <Button variant="ghost" onClick={l.startStringCheck} data-testid="listen-string-check">
              {t('coachStringCheckOffer')}
            </Button>
          ) : null}
        </p>
      ) : l.on && l.mic === 'running' && !unsupported ? (
        <p className="listen__hint" role="status">
          {t('listenReady')}
        </p>
      ) : null}
      {l.on && canCheck && !l.check ? (
        <Button variant="ghost" onClick={l.startStringCheck}>
          {t('coachStringCheckOffer')}
        </Button>
      ) : null}
    </div>
  );
}
