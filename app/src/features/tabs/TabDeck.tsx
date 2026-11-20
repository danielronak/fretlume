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
import type { Expectation, TimedExpectation } from '@audio/listener/core';
import { audioEngine } from '@audio/engine';
import { listener } from '@audio/listener/listener';
import { coachTiming, type Coach } from '@learn/coach';
import { useSettings } from '@/state/settings';
import { ListenPanel } from '@features/listen/ListenPanel';
import { useListening } from '@features/listen/useListening';
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
  /** With listening on, playback keeps time without sound (the listener must hear only the player). */
  const [silent, setSilent] = useState(false);
  /** Wait-mode: step note by note; the playhead waits until each is played right. */
  const [waitMode, setWaitMode] = useState(false);
  const [waitIndex, setWaitIndex] = useState(0);
  /** Timeline indices of beats with something to play. */
  const noteBeats = useMemo(
    () => beats.map((b, i) => (b.notes.some((n) => n.tech !== 'x') ? i : -1)).filter((i) => i >= 0),
    [beats],
  );
  const loopFrom = Math.min(loop[0], bars);
  const loopTo = Math.min(Math.max(loop[1], loopFrom), bars);

  /** Where the playhead is (ticks): the clock while playing, the loop or the start otherwise. */
  const tick = useCallback((): number => {
    if (waitMode) return beats[noteBeats[waitIndex] ?? -1]?.tick ?? 0;
    const pos = playback.player.current?.position();
    if (pos?.playing) return pos.tick;
    return loopOn ? (starts[loopFrom - 1] ?? 0) : 0;
  }, [playback.player, loopOn, starts, loopFrom, waitMode, beats, noteBeats, waitIndex]);

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
        loopOn
          ? { tempoPct, countIn, silent, loop: [loopFrom - 1, loopTo] }
          : { tempoPct, countIn, silent },
      );
  }, [playback, loopOn, tempoPct, countIn, loopFrom, loopTo, silent]);

  /** The beat the player should be playing now (timeline index), or −1. */
  const headIndex = playback.head
    ? beats.findIndex((b) => b.bar === playback.head!.bar && b.beat === playback.head!.beat)
    : -1;
  const currentBeat = waitMode ? (noteBeats[waitIndex] ?? -1) : playback.playing ? headIndex : -1;
  const expectation = useMemo((): Expectation | null => {
    const b = beats[currentBeat];
    if (!tab || !b) return null;
    const notes = beatNotes(tab, b);
    if (notes.length === 0) return null;
    return {
      id: `tab:${currentBeat}:${waitIndex}`,
      kind: notes.length === 1 ? 'note' : 'chord',
      notes,
    };
  }, [tab, beats, currentBeat, waitIndex]);
  const nextWait = useCallback(
    () => setWaitIndex((i) => (i + 1 < noteBeats.length ? i + 1 : 0)),
    [noteBeats.length],
  );
  /** AudioContext time when beat `i` sounds in the current pass (continuous play). */
  const beatContextTime = useCallback(
    (i: number) => {
      const b = beats[i];
      return b ? (playback.player.current?.contextTimeOf(b.tick) ?? null) : null;
    },
    [beats, playback.player],
  );

  return {
    tab,
    beats,
    frame,
    tick,
    toggle,
    playing: playback.playing,
    bars,
    listen: {
      expectation,
      currentBeat,
      waitMode,
      setWaitMode: (on: boolean) => {
        if (on) playback.stop();
        setWaitMode(on);
        setWaitIndex(0);
      },
      nextWait,
      waitIndex,
      noteBeats,
      setSilent,
      beatContextTime,
    },
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

/** The notes a beat asks for (muted 'x' notes are not), low string first; MIDI includes the capo. */
function beatNotes(tab: Tab, b: TimedBeat) {
  return b.notes
    .filter((n) => n.tech !== 'x')
    .map((n) => ({
      string: n.string,
      fret: n.fret,
      midi: tab.tuning[n.string - 1]! + tab.capo + n.fret,
    }))
    .sort((a, x) => x.string - a.string);
}

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

  // ---------- listening (phase 6 task 6.6) ----------
  const a4Hz = useSettings((x) => x.a4Hz);
  const L = stage.listen;
  const [timeline, setTimeline] = useState<TimedExpectation[] | null>(null);
  const [score, setScore] = useState({ hits: 0, attempts: 0, absDelta: 0, timed: 0 });
  const [timingCoach, setTimingCoach] = useState<Coach | null>(null);
  const listening = useListening({
    expectation: L.waitMode ? L.expectation : null,
    timeline: !L.waitMode && stage.playing ? timeline : null,
    sessionId: `tab:${tab?.id ?? ''}`,
    label: tab?.title ?? '',
    capo: tab?.capo ?? 0,
    a4Hz,
    onAttempt: (ok, _onset, info) => {
      if (L.waitMode && ok) L.nextWait();
      setScore((x) => ({
        hits: x.hits + (ok ? 1 : 0),
        attempts: x.attempts + 1,
        absDelta: x.absDelta + (info.deltaMs !== undefined ? Math.abs(info.deltaMs) : 0),
        timed: x.timed + (info.deltaMs !== undefined ? 1 : 0),
      }));
      setTimingCoach(info.deltaMs !== undefined ? coachTiming(info.deltaMs) : null);
    },
  });
  // With listening on, playback keeps time silently; off again, wait-mode ends.
  useEffect(() => {
    L.setSilent(listening.on);
    if (!listening.on) L.setWaitMode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening.on]);
  // Continuous play: the beats of the next few seconds, on the listener's clock.
  useEffect(() => {
    if (!listening.on || !stage.playing || L.waitMode || !tab) {
      setTimeline(null);
      return;
    }
    const build = () => {
      const now = audioEngine.context().currentTime;
      const items: TimedExpectation[] = [];
      stage.beats.forEach((b, i) => {
        const ct = L.beatContextTime(i);
        if (ct === null || ct < now - 1 || ct > now + 4) return;
        const notes = beatNotes(tab, b);
        if (notes.length === 0) return;
        items.push({
          id: `tab:${i}:${Math.round(ct * 10)}`,
          kind: notes.length === 1 ? 'note' : 'chord',
          notes,
          t: listener.toListenerTime(ct),
        });
      });
      setTimeline(items);
    };
    build();
    const id = setInterval(build, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening.on, stage.playing, L.waitMode, tab, stage.beats]);

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
          judged={listening.dots}
        />
      ) : null}
      <ListenPanel
        listening={listening}
        waitMode={L.waitMode}
        onWaitMode={L.setWaitMode}
        {...(L.waitMode ? { onMarkPlayed: L.nextWait } : {})}
        canCheck={L.expectation?.kind === 'chord'}
      />
      {listening.on && timingCoach ? (
        <p className="listen__hint" role="status">
          {t(timingCoach.key, timingCoach.params)}
        </p>
      ) : null}
      {listening.on && score.attempts > 0 ? (
        <p className="listen__hint" data-testid="tab-listen-score">
          {t('tabListenScore', {
            hits: score.hits,
            attempts: score.attempts,
            ms: score.timed ? Math.round(score.absDelta / score.timed) : 0,
          })}
        </p>
      ) : null}
      <div className="stage__actions">
        <Button
          variant="primary"
          onClick={stage.toggle}
          disabled={L.waitMode}
          data-testid="tab-stage-play"
        >
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
