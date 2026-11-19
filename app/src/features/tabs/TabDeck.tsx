/**
 * Tab play-along on the Stage (phase 5 task 5.7): transport (play, speed, loop A–B, count-in), a
 * scrolling tab strip, and — without the camera — the flat neck with the notes and approaching rings.
 * With the camera, StageScreen draws the same frame on the real neck (see `useTabStage`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { noteToken } from '@core/tab/ascii';
import { barStarts, timeline, TPQ, type Tab, type TimedBeat } from '@core/tab/model';
import { playAlongFrame, playAlongShape, type PlayAlongFrame } from '@core/tab/playalong';
import { t } from '@i18n/index';
import { FlatFretboard } from '@overlay/FlatFretboard';
import type { ColorMode, LabelMode } from '@overlay/display';
import { getTab } from '@storage/tabs';
import { useLive } from '@storage/useLive';
import { Button, Slider, Toggle } from '@ui/index';
import { DeckFrame } from '@features/stage/DeckFrame';
import { useTabPlayback } from './useTabPlayback';
import './tabs.css';

/** Notes come into view this many beats before they sound. */
const LOOKAHEAD_BEATS = 2;
const PX_PER_TICK = 80 / TPQ;
const HEADER_PX = 24;
const ROW_PX = 22;

export function useTabStage(tabId: string | null) {
  const tab = useLive<Tab | null>(
    () => (tabId ? getTab(tabId) : Promise.resolve(null)),
    [tabId],
    null,
  );
  const playback = useTabPlayback(tab);
  const beats = useMemo(() => (tab ? timeline(tab) : []), [tab]);
  const starts = useMemo(() => (tab ? barStarts(tab) : [0]), [tab]);
  const [tempoPct, setTempoPct] = useState(100);
  const [countIn, setCountIn] = useState(true);
  const [loopOn, setLoopOn] = useState(false);
  const [loop, setLoop] = useState<[number, number]>([1, 1]);
  const bars = Math.max(1, starts.length - 1);
  const loopFrom = Math.min(loop[0], bars);
  const loopTo = Math.min(Math.max(loop[1], loopFrom), bars);

  /** Where the playhead is (ticks): the clock while playing, the loop or the start otherwise. */
  const tick = useCallback((): number => {
    const pos = playback.player.current?.position();
    if (pos?.playing) return pos.tick;
    return loopOn ? (starts[loopFrom - 1] ?? 0) : 0;
  }, [playback.player, loopOn, starts, loopFrom]);

  const frame = useCallback((): PlayAlongFrame | null => {
    if (!tab) return null;
    const beatTicks = (TPQ * 4) / tab.timeSig[1];
    return playAlongFrame(beats, tick(), {
      lookaheadTicks: beatTicks * LOOKAHEAD_BEATS,
      beatTicks,
      capo: tab.capo,
    });
  }, [tab, beats, tick]);

  const toggle = useCallback(() => {
    if (playback.playing) playback.stop();
    else
      void playback.play(
        loopOn ? { tempoPct, countIn, loop: [loopFrom - 1, loopTo] } : { tempoPct, countIn },
      );
  }, [playback, loopOn, tempoPct, countIn, loopFrom, loopTo]);

  return {
    tab,
    beats,
    frame,
    tick,
    toggle,
    playing: playback.playing,
    bars,
    controls: {
      tempoPct,
      setTempoPct,
      countIn,
      setCountIn,
      loopOn,
      setLoopOn,
      loopFrom,
      loopTo,
      setLoop,
    },
  };
}

export type TabStage = ReturnType<typeof useTabStage>;

/** One line of tab that scrolls under a fixed playhead. */
function TabStrip({ tab, beats, tick }: { tab: Tab; beats: TimedBeat[]; tick: () => number }) {
  const inner = useRef<HTMLDivElement>(null);
  const strings = tab.tuning.length;
  useEffect(() => {
    let raf = 0;
    let lastIndex = -2;
    const loop = () => {
      const now = tick();
      const el = inner.current;
      if (el) {
        el.style.transform = `translateX(${(-now * PX_PER_TICK).toFixed(1)}px)`;
        let index = -1;
        for (let i = 0; i < beats.length && beats[i]!.tick <= now; i++) index = i;
        if (index !== lastIndex) {
          el.querySelector('.is-now')?.classList.remove('is-now');
          if (index >= 0) el.children[index]?.classList.add('is-now');
          lastIndex = index;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [beats, tick]);
  return (
    <div
      className="tabstrip"
      data-testid="tab-strip"
      aria-hidden="true"
      style={{ height: `${HEADER_PX + strings * ROW_PX + 6}px` }}
    >
      {Array.from({ length: strings }, (_, s) => (
        <div
          key={s}
          className="tabstrip__line"
          style={{ top: `${HEADER_PX + s * ROW_PX + ROW_PX / 2}px` }}
        />
      ))}
      <div className="tabstrip__head" />
      <div className="tabstrip__inner" ref={inner}>
        {beats.map((b, i) => (
          <div
            key={i}
            className={`tabstrip__col${b.beat === 0 ? ' is-bar' : ''}`}
            style={{ left: `${b.tick * PX_PER_TICK}px`, width: `${b.durTicks * PX_PER_TICK}px` }}
          >
            {b.chordSymbol ? <span className="tabstrip__chord">{b.chordSymbol}</span> : null}
            {b.notes.map((note) => (
              <span
                key={note.string}
                className="tabstrip__cell"
                style={{ top: `${HEADER_PX + (note.string - 1) * ROW_PX + ROW_PX / 2}px` }}
              >
                {noteToken(note)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TabDeck({
  stage,
  showDiagram,
  frets,
  labelMode,
  colorMode,
  leftHanded,
}: {
  stage: TabStage;
  showDiagram: boolean;
  frets: number;
  labelMode: LabelMode;
  colorMode: ColorMode;
  leftHanded: boolean;
}) {
  const { tab, controls: c } = stage;
  // The flat neck re-renders on every animation frame while it is shown.
  const [frame, setFrame] = useState<PlayAlongFrame | null>(null);
  useEffect(() => {
    if (!showDiagram) return;
    let raf = 0;
    const loop = () => {
      setFrame(stage.frame());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [showDiagram, stage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea, button')) return;
      if (e.key === ' ') {
        e.preventDefault();
        stage.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage]);

  if (!tab) return null;
  const shape = frame ? playAlongShape(tab, frame) : null;
  const pulse = new Set(frame?.current.map((n) => `${n.string}-${n.fret + tab.capo}`) ?? []);
  return (
    <DeckFrame
      title={
        <>
          <strong data-testid="stage-entry">{tab.title}</strong>
          <span data-testid="tab-chord">{frame?.chord ?? ''}</span>
        </>
      }
    >
      <TabStrip tab={tab} beats={stage.beats} tick={stage.tick} />
      {showDiagram && shape ? (
        <FlatFretboard
          shape={shape}
          frets={frets}
          labelMode={labelMode}
          colorMode={colorMode === 'group' ? 'note' : colorMode}
          leftHanded={leftHanded}
          activeGroups={['now']}
          pulse={pulse}
          approach={frame?.upcoming ?? []}
        />
      ) : null}
      <div className="stage__actions">
        <Button variant="primary" onClick={stage.toggle} data-testid="tab-stage-play">
          {stage.playing ? t('tabStop') : t('tabPlay')}
        </Button>
        <div className="tabedit__speed">
          <Slider
            label={t('tabTempoPct')}
            value={c.tempoPct}
            min={25}
            max={150}
            step={5}
            onChange={c.setTempoPct}
            format={(v) => `${v} %`}
          />
        </div>
        <Toggle label={t('tabCountIn')} checked={c.countIn} onChange={c.setCountIn} />
        <Toggle label={t('tabLoop')} checked={c.loopOn} onChange={c.setLoopOn} />
        {c.loopOn ? (
          <>
            <label className="tabedit__field tabedit__field--small">
              <span>{t('tabLoopFrom')}</span>
              <input
                type="number"
                min={1}
                max={stage.bars}
                value={c.loopFrom}
                data-testid="tab-loop-from"
                onChange={(e) => c.setLoop([Number(e.target.value) || 1, c.loopTo])}
              />
            </label>
            <label className="tabedit__field tabedit__field--small">
              <span>{t('tabLoopTo')}</span>
              <input
                type="number"
                min={1}
                max={stage.bars}
                value={c.loopTo}
                data-testid="tab-loop-to"
                onChange={(e) => c.setLoop([c.loopFrom, Number(e.target.value) || 1])}
              />
            </label>
          </>
        ) : null}
      </div>
    </DeckFrame>
  );
}
