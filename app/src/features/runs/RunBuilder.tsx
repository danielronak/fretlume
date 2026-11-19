/**
 * /library/runs/new and /library/runs/:id — the three-step practice-run builder (parity P-F10):
 * choose cards → set up → review and save.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSettings } from '@/state/settings';
import { libraryItem } from '@core/theory/library/index';
import { TUNINGS } from '@core/theory/tuning';
import { t, type MessageKey } from '@i18n/index';
import {
  DEFAULT_CARD_AMOUNT,
  moveCard,
  newRun,
  runDurationMs,
  RUN_LIMITS,
  type PracticeRun,
  type RunCard,
} from '@learn/run';
import type { ColorMode, LabelMode } from '@overlay/display';
import type { Folder } from '@storage/db';
import { listFavourites, listFolders } from '@storage/library';
import { getRun, newRunId, saveRun } from '@storage/runs';
import { useLive } from '@storage/useLive';
import { Icon } from '@ui/icons';
import { Button, IconButton, Toggle, useToast } from '@ui/index';
import { ItemPicker } from '@features/library/ItemPicker';
import { cardTitle, formatDuration, resolveCard } from './runCards';
import './runs.css';

const STEPS: MessageKey[] = ['runStepChoose', 'runStepSetup', 'runStepReview'];
const LABELS: [LabelMode, MessageKey][] = [
  ['notes', 'labelNotes'],
  ['intervals', 'labelIntervals'],
  ['fingers', 'labelFingers'],
];
const COLOURS: [ColorMode, MessageKey][] = [
  ['group', 'colourGroup'],
  ['note', 'colourNote'],
  ['degree', 'colourDegree'],
];

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  testId?: string;
}) {
  return (
    <label className="runs__field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        data-testid={testId}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, Math.round(v))));
        }}
      />
    </label>
  );
}

/** Step 1: pick cards from the library, favourites or folders. */
function Choose({ run, setRun }: { run: PracticeRun; setRun: (r: PracticeRun) => void }) {
  const favourites = useLive(() => listFavourites(), [], [] as string[]);
  const folders = useLive<Folder[]>(() => listFolders(), [], []);
  const add = (ids: string[]) => {
    const cards: RunCard[] = ids
      .filter((id) => libraryItem(id))
      .map((id) => ({
        itemId: id,
        entry: 0,
        amount: DEFAULT_CARD_AMOUNT[run.unit],
        repeats: 1,
      }));
    if (cards.length === 0) return;
    setRun({ ...run, cards: [...run.cards, ...cards].slice(0, RUN_LIMITS.cards) });
  };
  return (
    <div className="runs__choose">
      <section className="lib-section">
        <h2>{t('runChooseBrowse')}</h2>
        <ItemPicker label={t('runAdd')} onPick={(id) => add([id])} />
      </section>
      {favourites.length > 0 ? (
        <section className="lib-section">
          <h2>{t('runChooseFavourites')}</h2>
          <ul className="runs__pick-list">
            {favourites.map((id) => (
              <li key={id}>
                <span>{libraryItem(id)?.title ?? id}</span>
                <Button variant="ghost" onClick={() => add([id])}>
                  {t('runAdd')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {folders.length > 0 ? (
        <section className="lib-section">
          <h2>{t('runChooseFolders')}</h2>
          <ul className="runs__pick-list">
            {folders.map((f) => (
              <li key={f.id}>
                <span>
                  {f.name} ({f.itemIds.length})
                </span>
                <Button variant="ghost" onClick={() => add(f.itemIds)} disabled={!f.itemIds.length}>
                  {t('runAddAll')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Step 2: order, shape, time and repeats per card; run-wide options. */
function Setup({ run, setRun }: { run: PracticeRun; setRun: (r: PracticeRun) => void }) {
  const settings = useSettings();
  const tuning = TUNINGS[settings.tuning];
  const frets = settings.guitar === 'electric' ? 22 : 15;
  const unitMax = RUN_LIMITS.amount[run.unit];
  const setCard = (i: number, patch: Partial<RunCard>) =>
    setRun({ ...run, cards: run.cards.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <div className="runs__setup">
      <ol className="runs__cards" data-testid="run-cards">
        {run.cards.map((card, i) => {
          const r = resolveCard(card, tuning, frets);
          if (!r) return null;
          const name = r.item.title;
          return (
            <li key={`${i}-${card.itemId}`} className="runs__card">
              <div className="runs__card-head">
                <strong>{cardTitle(r)}</strong>
                <div className="runs__card-tools">
                  <IconButton
                    label={t('runMoveUp', { name })}
                    disabled={i === 0}
                    onClick={() => setRun({ ...run, cards: moveCard(run.cards, i, i - 1) })}
                  >
                    <Icon name="chevronUp" size={18} />
                  </IconButton>
                  <IconButton
                    label={t('runMoveDown', { name })}
                    disabled={i === run.cards.length - 1}
                    onClick={() => setRun({ ...run, cards: moveCard(run.cards, i, i + 1) })}
                  >
                    <Icon name="chevronDown" size={18} />
                  </IconButton>
                  <IconButton
                    label={t('runRemoveCard', { name })}
                    onClick={() => setRun({ ...run, cards: run.cards.filter((_, j) => j !== i) })}
                  >
                    <Icon name="close" size={18} />
                  </IconButton>
                </div>
              </div>
              <div className="runs__card-fields">
                {r.entryLabels.length > 1 ? (
                  <label className="runs__field">
                    <span>{t('runCardShape')}</span>
                    <select
                      value={card.entry}
                      onChange={(e) => setCard(i, { entry: Number(e.target.value) })}
                    >
                      {r.entryLabels.map((label, k) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <NumberField
                  label={t(run.unit === 'seconds' ? 'runCardAmountSeconds' : 'runCardAmountBars')}
                  value={card.amount}
                  min={unitMax[0]}
                  max={unitMax[1]}
                  onChange={(amount) => setCard(i, { amount })}
                  testId="run-card-amount"
                />
                <NumberField
                  label={t('runCardRepeats')}
                  value={card.repeats}
                  min={RUN_LIMITS.repeats[0]}
                  max={RUN_LIMITS.repeats[1]}
                  onChange={(repeats) => setCard(i, { repeats })}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <section className="lib-section runs__options">
        <label className="runs__field">
          <span>{t('runUnit')}</span>
          <select
            value={run.unit}
            onChange={(e) => {
              const unit = e.target.value as PracticeRun['unit'];
              setRun({
                ...run,
                unit,
                cards: run.cards.map((c) => ({ ...c, amount: DEFAULT_CARD_AMOUNT[unit] })),
              });
            }}
          >
            <option value="seconds">{t('runUnitSeconds')}</option>
            <option value="bars">{t('runUnitBars')}</option>
          </select>
        </label>
        <NumberField
          label={`${t('runTempo')} (BPM)`}
          value={run.tempoBpm}
          min={RUN_LIMITS.tempo[0]}
          max={RUN_LIMITS.tempo[1]}
          onChange={(tempoBpm) => setRun({ ...run, tempoBpm })}
        />
        <NumberField
          label={t('runBeatsPerBar')}
          value={run.beatsPerBar}
          min={2}
          max={7}
          onChange={(beatsPerBar) => setRun({ ...run, beatsPerBar })}
        />
        <label className="runs__field">
          <span>{t('runLabels')}</span>
          <select
            value={run.labelMode}
            onChange={(e) => setRun({ ...run, labelMode: e.target.value as LabelMode })}
          >
            {LABELS.map(([v, k]) => (
              <option key={v} value={v}>
                {t(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="runs__field">
          <span>{t('runColours')}</span>
          <select
            value={run.colorMode}
            onChange={(e) => setRun({ ...run, colorMode: e.target.value as ColorMode })}
          >
            {COLOURS.map(([v, k]) => (
              <option key={v} value={v}>
                {t(k)}
              </option>
            ))}
          </select>
        </label>
        <Toggle
          label={t('runLoop')}
          checked={run.loop}
          onChange={(loop) => setRun({ ...run, loop })}
        />
        <Toggle
          label={t('runSound')}
          checked={run.sound}
          onChange={(sound) => setRun({ ...run, sound })}
        />
      </section>
    </div>
  );
}

/** Step 3: name and summary. */
function Review({ run, setRun }: { run: PracticeRun; setRun: (r: PracticeRun) => void }) {
  const settings = useSettings();
  const tuning = TUNINGS[settings.tuning];
  const frets = settings.guitar === 'electric' ? 22 : 15;
  return (
    <div className="runs__review">
      <label className="runs__field runs__field--wide">
        <span>{t('runName')}</span>
        <input
          type="text"
          maxLength={80}
          value={run.name}
          placeholder={t('runNamePlaceholder')}
          data-testid="run-name"
          onChange={(e) => setRun({ ...run, name: e.target.value })}
        />
      </label>
      <ol className="runs__summary">
        {run.cards.map((card, i) => {
          const r = resolveCard(card, tuning, frets);
          return r ? (
            <li key={i}>
              {cardTitle(r)} · {card.amount}{' '}
              {t(run.unit === 'seconds' ? 'runUnitSeconds' : 'runUnitBars')}
              {card.repeats > 1 ? ` × ${card.repeats}` : ''}
            </li>
          ) : null;
        })}
      </ol>
      <p>{t('runTotal', { time: formatDuration(runDurationMs(run)) })}</p>
    </div>
  );
}

export function RunBuilder() {
  const params = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editing = params.runId && params.runId !== 'new' ? params.runId : null;
  const [run, setRun] = useState<PracticeRun | null>(editing ? null : newRun(newRunId(), ''));
  const [step, setStep] = useState(editing ? 1 : 0);

  useEffect(() => {
    if (!editing) return;
    void getRun(editing).then((r) => {
      if (r) setRun(r);
      else {
        toast.show(t('runsNotFound'));
        navigate('/library/runs', { replace: true });
      }
    });
  }, [editing, navigate, toast]);

  const canNext = useMemo(() => (run ? run.cards.length > 0 : false), [run]);
  if (!run) return null;

  const save = async (play: boolean) => {
    if (!run.name.trim()) {
      toast.show(t('runNeedsName'));
      return;
    }
    const saved = await saveRun(run);
    toast.show(t('runsSaved', { name: saved.name }));
    navigate(play ? `/stage/run/${saved.id}` : '/library/runs');
  };

  return (
    <div className="screen runs-builder" data-testid="run-builder">
      <h1>{t(editing ? 'runBuilderEdit' : 'runBuilderNew')}</h1>
      <ol className="runs__steps" aria-label={t('runsTitle')}>
        {STEPS.map((k, i) => (
          <li key={k} aria-current={i === step ? 'step' : undefined}>
            <button
              type="button"
              className="runs__step"
              onClick={() => (i === 0 || canNext) && setStep(i)}
            >
              {t(k)}
            </button>
          </li>
        ))}
      </ol>
      {step === 0 ? <Choose run={run} setRun={setRun} /> : null}
      {step === 1 ? <Setup run={run} setRun={setRun} /> : null}
      {step === 2 ? <Review run={run} setRun={setRun} /> : null}
      {step === 0 ? (
        <section className="lib-section">
          <h2>{t('runCards')}</h2>
          {run.cards.length === 0 ? (
            <p className="lib-hint">{t('runNoCards')}</p>
          ) : (
            <ol className="runs__summary" data-testid="run-chosen">
              {run.cards.map((c, i) => (
                <li key={i}>{libraryItem(c.itemId)?.title}</li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
      <div className="runs__nav">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            {t('runBack')}
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => navigate('/library/runs')}>
            {t('runBack')}
          </Button>
        )}
        {step < 2 ? (
          <Button
            variant="primary"
            data-testid="run-next"
            onClick={() => (canNext ? setStep(step + 1) : toast.show(t('runNeedsCards')))}
          >
            {t('runNext')}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => void save(false)} data-testid="run-save">
              {t('runSave')}
            </Button>
            <Button variant="primary" onClick={() => void save(true)} data-testid="run-save-play">
              {t('runSaveAndPlay')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
