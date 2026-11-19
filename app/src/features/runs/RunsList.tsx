/** /library/runs: the player's practice runs (phase 5 task 5.2, parity P-F10). */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { t } from '@i18n/index';
import { runDurationMs, type PracticeRun } from '@learn/run';
import { copyRun, deleteRun, listRuns } from '@storage/runs';
import { useLive } from '@storage/useLive';
import { Button, Dialog, useToast } from '@ui/index';
import { formatDuration } from './runCards';
import './runs.css';

export function RunsList() {
  const runs = useLive<PracticeRun[]>(() => listRuns(), [], []);
  const navigate = useNavigate();
  const toast = useToast();
  const [deleting, setDeleting] = useState<PracticeRun | null>(null);

  return (
    <div className="runs" data-testid="runs-list">
      <p className="lib-hint">{t('runsIntro')}</p>
      <div className="runs__actions">
        <Button
          variant="primary"
          onClick={() => navigate('/library/runs/new')}
          data-testid="runs-new"
        >
          {t('runsNew')}
        </Button>
      </div>
      {runs.length === 0 ? (
        <p className="lib-hint">{t('runsEmpty')}</p>
      ) : (
        <ul className="runs__list">
          {runs.map((run) => (
            <li key={run.id} className="runs__item" data-testid="run-item">
              <div className="runs__name">
                <strong>{run.name}</strong>
                <span className="runs__meta">
                  {t('runsSummary', {
                    cards: run.cards.length,
                    time: formatDuration(runDurationMs(run)),
                  })}
                </span>
              </div>
              <div className="runs__buttons">
                <Link
                  className="btn btn--primary"
                  to={`/stage/run/${run.id}`}
                  data-testid="run-play"
                >
                  {t('runsPlay')}
                </Link>
                <Link className="btn btn--secondary" to={`/library/runs/${run.id}`}>
                  {t('runsEdit')}
                </Link>
                <Button
                  variant="ghost"
                  onClick={() => void copyRun(run, t('runsCopyName', { name: run.name }))}
                >
                  {t('runsDuplicate')}
                </Button>
                <Button variant="ghost" onClick={() => setDeleting(run)}>
                  {t('runsDelete')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={deleting ? t('runsDeleteConfirm', { name: deleting.name }) : ''}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {t('runBack')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!deleting) return;
                void deleteRun(deleting.id);
                toast.show(t('runsDeleted', { name: deleting.name }));
                setDeleting(null);
              }}
            >
              {t('runsDelete')}
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </div>
  );
}
