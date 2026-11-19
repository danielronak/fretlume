/**
 * /learn and /learn/:lessonId — lesson list and player (phase 5 task 5.8). Runs `explain` and `demo`
 * sections; guided, drill and check sections come with listening (Phase 6) and the course (Phase 8).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSettings } from '@/state/settings';
import { LESSONS, lessonById } from '@content/lessons/index';
import type { DemoStep, Section, TrackId } from '@content/lessons/types';
import { TUNINGS } from '@core/theory/tuning';
import { t, type MessageKey } from '@i18n/index';
import { cardNotes } from '@learn/cardSound';
import type { Step } from '@learn/session';
import { useSession } from '@learn/useSession';
import { playNotes } from '@audio/player';
import { FlatFretboard } from '@overlay/FlatFretboard';
import { Button } from '@ui/index';
import { resolveFigure, type ResolvedFigure } from './figure';
import './learn.css';

const TRACKS: [TrackId, MessageKey][] = [
  ['first-steps', 'learnTrackFirstSteps'],
  ['chords', 'learnTrackChords'],
  ['rhythm', 'learnTrackRhythm'],
  ['fretboard', 'learnTrackFretboard'],
  ['lead', 'learnTrackLead'],
];
const FRETS = 15;

export function LearnScreen() {
  return (
    <div className="screen learn" data-testid="screen-learn">
      <h1>{t('learnTitle')}</h1>
      <p className="screen__lede">{t('learnLede')}</p>
      {TRACKS.map(([track, label]) => {
        const lessons = LESSONS.filter((l) => l.track === track);
        if (lessons.length === 0) return null;
        return (
          <section key={track} className="learn__track">
            <h2>{t(label)}</h2>
            <ul className="learn__list">
              {lessons.map((lesson) => (
                <li key={lesson.id}>
                  <Link
                    to={`/learn/${lesson.id}`}
                    className="learn__card"
                    data-testid="lesson-card"
                  >
                    <strong>{t(lesson.titleKey)}</strong>
                    <span>{t(lesson.summaryKey)}</span>
                    <span className="learn__minutes">
                      {t('learnMinutes', { n: lesson.minutes })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="lib-hint">{t('learnMoreSoon')}</p>
    </div>
  );
}

function useFigureContext() {
  const settings = useSettings();
  return {
    tuning: TUNINGS[settings.tuning],
    a4Hz: settings.a4Hz,
    leftHanded: settings.handedness === 'left',
    labelMode: settings.labelMode,
  };
}

/** Play a figure's notes and light each dot as it sounds. */
function useHear(a4Hz: number) {
  const [pulse, setPulse] = useState<ReadonlySet<string>>(() => new Set());
  const hear = (figure: ResolvedFigure) => {
    const notes = cardNotes(figure.shape, figure.activeGroups, 2400);
    if (notes.length === 0) return;
    void playNotes(
      notes.map((n) => ({ midi: n.midi, offset: n.offset })),
      a4Hz,
    );
    notes.forEach((n) =>
      window.setTimeout(() => setPulse(new Set([`${n.string}-${n.fret}`])), 30 + n.offset * 1000),
    );
    const last = notes[notes.length - 1]!;
    window.setTimeout(() => setPulse(new Set()), 30 + last.offset * 1000 + 400);
  };
  return { pulse, hear };
}

function Figure({
  figure,
  pulse,
  onHear,
}: {
  figure: ResolvedFigure;
  pulse: ReadonlySet<string>;
  onHear: () => void;
}) {
  const ctx = useFigureContext();
  return (
    <figure className="learn__figure">
      <FlatFretboard
        shape={figure.shape}
        frets={FRETS}
        labelMode={ctx.labelMode}
        colorMode="degree"
        leftHanded={ctx.leftHanded}
        activeGroups={figure.activeGroups}
        pulse={pulse}
      />
      <figcaption className="learn__figure-actions">
        <span>{figure.label}</span>
        <Button onClick={onHear} data-testid="lesson-hear">
          {t('lessonHear')}
        </Button>
        <Link className="btn btn--secondary" to={figure.stagePath}>
          {t('lessonOnGuitar')}
        </Link>
      </figcaption>
    </figure>
  );
}

function Explain({ section }: { section: Extract<Section, { kind: 'explain' }> }) {
  const ctx = useFigureContext();
  const { pulse, hear } = useHear(ctx.a4Hz);
  const figure = section.figure ? resolveFigure(section.figure, ctx.tuning, FRETS) : null;
  return (
    <div className="learn__section" data-testid="lesson-explain">
      <p className="learn__text">{t(section.bodyKey)}</p>
      {figure ? <Figure figure={figure} pulse={pulse} onHear={() => hear(figure)} /> : null}
    </div>
  );
}

function Demo({ section }: { section: Extract<Section, { kind: 'demo' }> }) {
  const ctx = useFigureContext();
  const { pulse, hear } = useHear(ctx.a4Hz);
  const steps: Step<DemoStep>[] = useMemo(
    () =>
      section.steps.map((step, i) => ({
        id: String(i),
        show: step,
        advance: { auto: 'timer' as const, seconds: step.seconds ?? 6 },
      })),
    [section],
  );
  const [session, send] = useSession(steps);
  const step = section.steps[session.index]!;
  const figure = resolveFigure(step, ctx.tuning, FRETS);
  // While the demo plays, each step sounds as it comes up.
  useEffect(() => {
    if (session.playing && figure) hear(figure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.index, session.playing]);
  return (
    <div className="learn__section" data-testid="lesson-demo">
      <p className="learn__step-count" data-testid="lesson-demo-step">
        {t('lessonDemoStep', { n: session.index + 1, total: section.steps.length })}
      </p>
      <p className="learn__text">{t(step.textKey)}</p>
      {figure ? <Figure figure={figure} pulse={pulse} onHear={() => hear(figure)} /> : null}
      <div className="learn__controls">
        <Button
          variant="primary"
          onClick={() => send({ type: session.playing ? 'pause' : 'start' })}
          data-testid="lesson-demo-play"
        >
          {session.playing ? t('lessonDemoPause') : t('lessonDemoPlay')}
        </Button>
        <Button onClick={() => send({ type: 'back' })} aria-label={t('stageDeckBack')}>
          ◄
        </Button>
        <Button
          onClick={() => send({ type: 'next' })}
          aria-label={t('stageDeckNext')}
          data-testid="lesson-demo-next"
        >
          ►
        </Button>
      </div>
    </div>
  );
}

export function LessonPlayer() {
  const { lessonId = '' } = useParams();
  const lesson = lessonById(lessonId);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  if (!lesson)
    return (
      <div className="screen learn">
        <p>{t('lessonNotFound')}</p>
        <Link to="/learn">{t('lessonBack')}</Link>
      </div>
    );
  const section = lesson.sections[index]!;
  const last = index === lesson.sections.length - 1;
  return (
    <article className="screen learn lesson" data-testid="screen-lesson">
      <div className="tool-header">
        <Link to="/learn" className="tool-header__back">
          {t('lessonBack')}
        </Link>
        <h1>{t(lesson.titleKey)}</h1>
      </div>
      <p className="learn__progress" data-testid="lesson-progress">
        {t('lessonSection', { n: index + 1, total: lesson.sections.length })}
      </p>
      {done ? (
        <div className="learn__section" role="status" data-testid="lesson-done">
          <p className="learn__text">{t('lessonDone')}</p>
          <Link className="btn btn--primary" to="/learn">
            {t('lessonBack')}
          </Link>
        </div>
      ) : section.kind === 'explain' ? (
        <Explain key={index} section={section} />
      ) : (
        <Demo key={index} section={section} />
      )}
      {done ? null : (
        <div className="learn__nav">
          <Button disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
            {t('lessonPrevious')}
          </Button>
          <Button
            variant="primary"
            data-testid="lesson-next"
            onClick={() => (last ? setDone(true) : setIndex((i) => i + 1))}
          >
            {last ? t('lessonFinish') : t('lessonNext')}
          </Button>
        </div>
      )}
    </article>
  );
}
