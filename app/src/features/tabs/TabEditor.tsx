/**
 * /tabs/:tabId — the tab editor (phase 5 task 5.5): keyboard-first grid, touch fret pad, chord row,
 * properties, playback with speed, loop and count-in, autosave, and ASCII / file export.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toAscii } from '@core/tab/ascii';
import {
  barFill,
  createEditor,
  edit,
  noteAt,
  type EditAction,
  type EditorState,
} from '@core/tab/edit';
import type { Tab } from '@core/tab/model';
import { TUNINGS } from '@core/theory/tuning';
import { t } from '@i18n/index';
import { getTab, saveTab } from '@storage/tabs';
import { downloadText, fileNameFrom } from '@ui/download';
import { Button, Slider, Toggle } from '@ui/index';
import { KEY_HELP, keyCommand } from './keys';
import { TabGrid } from './TabGrid';
import { durationName, TabPad } from './TabPad';
import { useTabPlayback } from './useTabPlayback';
import './tabs.css';

const AUTOSAVE_MS = 600;
const TIME_SIGS: [number, number][] = [
  [2, 4],
  [3, 4],
  [4, 4],
  [5, 4],
  [6, 8],
  [7, 8],
  [9, 8],
  [12, 8],
];
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const tuningNotes = (tuning: number[]) =>
  [...tuning]
    .reverse()
    .map((m) => NOTE[((m % 12) + 12) % 12])
    .join(' ');

type Load = { status: 'loading' } | { status: 'missing' } | { status: 'ready' };

function reducer(s: EditorState, a: EditAction): EditorState {
  return edit(s, a);
}

export function TabEditor() {
  const { tabId = '' } = useParams();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [state, dispatch] = useReducer(reducer, null, () =>
    createEditor({
      id: '',
      title: '',
      tuning: [64, 59, 55, 50, 45, 40],
      capo: 0,
      tempoBpm: 90,
      timeSig: [4, 4],
      tracks: [{ bars: [{ beats: [{ durTicks: 480, notes: [], rest: true }] }] }],
    }),
  );
  const [saved, setSaved] = useState(true);
  const loadedTab = useRef<Tab | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const tab = state.tab;

  useEffect(() => {
    let live = true;
    void getTab(tabId).then((found) => {
      if (!live) return;
      if (!found) return setLoad({ status: 'missing' });
      loadedTab.current = found;
      dispatch({ type: 'load', tab: found });
      setLoad({ status: 'ready' });
    });
    return () => {
      live = false;
    };
  }, [tabId]);

  // Autosave shortly after each change, and on leaving.
  const latest = useRef(tab);
  latest.current = tab;
  useEffect(() => {
    if (load.status !== 'ready' || tab === loadedTab.current) return;
    setSaved(false);
    const timer = setTimeout(() => {
      void saveTab(tab).then(() => setSaved(true));
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [tab, load.status]);
  useEffect(
    () => () => {
      if (latest.current !== loadedTab.current && latest.current.id) void saveTab(latest.current);
    },
    [],
  );

  const playback = useTabPlayback(load.status === 'ready' ? tab : null);
  const bars = tab.tracks[0]?.bars.length ?? 1;
  const [tempoPct, setTempoPct] = useState(100);
  const [countIn, setCountIn] = useState(false);
  const [loopOn, setLoopOn] = useState(false);
  const [loopFrom, setLoopFrom] = useState(1);
  const [loopTo, setLoopTo] = useState(1);
  const loopRange: [number, number] = [
    Math.min(loopFrom, bars) - 1,
    Math.min(Math.max(loopTo, loopFrom), bars),
  ];

  const togglePlay = useCallback(() => {
    if (playback.playing) {
      playback.stop();
      return;
    }
    // Without a loop, play once from the cursor's bar to the end.
    void playback.play(
      loopOn
        ? { tempoPct, countIn, loop: loopRange }
        : { tempoPct, countIn, startBar: state.cursor.bar },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback, tempoPct, countIn, loopOn, loopRange[0], loopRange[1], state.cursor.bar, bars]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const command = keyCommand(e, performance.now());
    if (!command) return;
    e.preventDefault();
    if (command.type === 'play') togglePlay();
    else if (command.type === 'save') void saveTab(tab).then(() => setSaved(true));
    else dispatch(command);
  };

  const onPick = useCallback((c: EditorState['cursor']) => {
    dispatch({ type: 'goto', cursor: c });
    gridRef.current?.focus({ preventScroll: true });
  }, []);
  const onChord = useCallback(
    (bar: number, symbol: string) => dispatch({ type: 'chord', bar, symbol }),
    [],
  );

  useEffect(() => {
    document
      .getElementById('tab-cursor')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [state.cursor]);

  const fills = useMemo(() => barFill(tab), [tab]);
  const current = noteAt(tab, state.cursor);
  const beat = tab.tracks[0]?.bars[state.cursor.bar]?.beats[state.cursor.beat];
  const tuningId =
    Object.values(TUNINGS).find((x) => x.strings.join() === tab.tuning.join())?.id ?? 'custom';

  if (load.status === 'missing')
    return (
      <div className="screen tabs">
        <p>{t('tabsNotFound')}</p>
        <Link to="/tabs">{t('tabsBackToList')}</Link>
      </div>
    );
  if (load.status === 'loading') return <div className="screen tabs" aria-busy="true" />;

  return (
    <div className="screen tabs tabedit" data-testid="screen-tab-editor">
      <div className="tabedit__top">
        <Link to="/tabs" className="tabedit__back">
          ← {t('tabsBackToList')}
        </Link>
        <span className="tabedit__saved" role="status" data-testid="tab-saved">
          {saved ? t('tabSaved') : t('tabSaving')}
        </span>
      </div>
      <input
        className="tabedit__title"
        aria-label={t('tabTitleLabel')}
        defaultValue={tab.title}
        key={`title-${tab.id}-${tab.title}`}
        maxLength={120}
        data-testid="tab-title"
        onBlur={(e) => {
          const title = e.target.value.trim();
          if (title && title !== tab.title) dispatch({ type: 'meta', patch: { title } });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />

      <div className="tabedit__props">
        <label className="tabedit__field">
          <span>{t('tabTuningLabel')}</span>
          <select
            value={tuningId}
            data-testid="tab-tuning"
            onChange={(e) => {
              const preset = Object.values(TUNINGS).find((x) => x.id === e.target.value);
              if (preset) dispatch({ type: 'meta', patch: { tuning: [...preset.strings] } });
            }}
          >
            {tab.tuning.length === 6
              ? Object.values(TUNINGS).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))
              : null}
            {tuningId === 'custom' ? (
              <option value="custom">
                {t('tabTuningCustom', { notes: tuningNotes(tab.tuning) })}
              </option>
            ) : null}
          </select>
        </label>
        <label className="tabedit__field">
          <span>{t('tabCapoLabel')}</span>
          <input
            type="number"
            min={0}
            max={12}
            value={tab.capo}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              if (v >= 0 && v <= 12) dispatch({ type: 'meta', patch: { capo: v } });
            }}
          />
        </label>
        <label className="tabedit__field">
          <span>{t('tabTempoLabel')}</span>
          <input
            type="number"
            min={20}
            max={400}
            defaultValue={tab.tempoBpm}
            key={`tempo-${tab.tempoBpm}`}
            data-testid="tab-tempo"
            onBlur={(e) => {
              const v = Math.round(Number(e.target.value));
              if (v >= 20 && v <= 400 && v !== tab.tempoBpm)
                dispatch({ type: 'meta', patch: { tempoBpm: v } });
            }}
          />
        </label>
        <label className="tabedit__field">
          <span>{t('tabTimeLabel')}</span>
          <select
            value={tab.timeSig.join('/')}
            onChange={(e) => {
              const [n, d] = e.target.value.split('/').map(Number) as [number, number];
              dispatch({ type: 'meta', patch: { timeSig: [n, d] } });
            }}
          >
            {(TIME_SIGS.some((x) => x.join('/') === tab.timeSig.join('/'))
              ? TIME_SIGS
              : [tab.timeSig, ...TIME_SIGS]
            ).map((x) => (
              <option key={x.join('/')} value={x.join('/')}>
                {x.join('/')}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="tabedit__transport">
        <Button variant="primary" onClick={togglePlay} data-testid="tab-play">
          {playback.playing ? t('tabStop') : t('tabPlay')}
        </Button>
        <div className="tabedit__speed">
          <Slider
            label={t('tabTempoPct')}
            value={tempoPct}
            min={25}
            max={150}
            step={5}
            onChange={setTempoPct}
            format={(v) => `${v} %`}
          />
        </div>
        <Toggle label={t('tabCountIn')} checked={countIn} onChange={setCountIn} />
        <Toggle label={t('tabLoop')} checked={loopOn} onChange={setLoopOn} />
        {loopOn ? (
          <>
            <label className="tabedit__field tabedit__field--small">
              <span>{t('tabLoopFrom')}</span>
              <input
                type="number"
                min={1}
                max={bars}
                value={loopFrom}
                onChange={(e) =>
                  setLoopFrom(Math.max(1, Math.min(bars, Number(e.target.value) || 1)))
                }
              />
            </label>
            <label className="tabedit__field tabedit__field--small">
              <span>{t('tabLoopTo')}</span>
              <input
                type="number"
                min={1}
                max={bars}
                value={loopTo}
                onChange={(e) =>
                  setLoopTo(Math.max(1, Math.min(bars, Number(e.target.value) || 1)))
                }
              />
            </label>
          </>
        ) : null}
        <Link className="btn btn--secondary" to={`/stage/tab/${tab.id}`} data-testid="tab-stage">
          {t('tabOnGuitar')}
        </Link>
      </div>

      <div
        ref={gridRef}
        className="tabedit__grid"
        tabIndex={0}
        role="application"
        aria-label={t('tabEditorLabel')}
        aria-describedby="tab-status"
        data-testid="tab-grid"
        onKeyDown={onKeyDown}
      >
        <TabGrid
          tab={tab}
          cursor={state.cursor}
          fills={fills}
          head={playback.head}
          onPick={onPick}
          onChord={onChord}
        />
      </div>
      <p id="tab-status" className="tabedit__status" aria-live="polite" data-testid="tab-status">
        {t('tabCursorStatus', {
          bar: state.cursor.bar + 1,
          beat: state.cursor.beat + 1,
          string: state.cursor.string,
          duration: durationName(beat?.durTicks ?? 0),
        })}
      </p>

      <TabPad
        dispatch={(a) => {
          dispatch(a);
          gridRef.current?.focus({ preventScroll: true });
        }}
        fret={current?.fret ?? null}
        tech={current?.tech}
        durTicks={beat?.durTicks ?? 480}
      />

      <div className="tabedit__export">
        <Button
          data-testid="tab-export-ascii"
          onClick={() =>
            downloadText(`${fileNameFrom(tab.title, 'tab')}.txt`, toAscii(tab), 'text/plain')
          }
        >
          {t('tabExportAscii')}
        </Button>
        <Button
          data-testid="tab-export-json"
          onClick={() =>
            downloadText(
              `${fileNameFrom(tab.title, 'tab')}.fretlume-tab.json`,
              JSON.stringify(tab, null, 1),
            )
          }
        >
          {t('tabExportJson')}
        </Button>
      </div>

      <details className="tabedit__keys">
        <summary>{t('tabKeysTitle')}</summary>
        <dl>
          {KEY_HELP.map(([keys, what]) => (
            <div key={keys}>
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{t(what)}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
