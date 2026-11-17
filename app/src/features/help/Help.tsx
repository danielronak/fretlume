import type { ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { APP_VERSION } from '@/config';
import { cagedChordShape, chordVoicings, voicingToShape } from '@core/theory/chords/index';
import { t, type MessageKey } from '@i18n/index';
import { FlatFretboard } from '@overlay/FlatFretboard';
import {
  InstallIllustration,
  LegendGlyph,
  MetronomeIllustration,
  MicSetupIllustration,
} from './illustrations';
import './help.css';

interface Guide {
  id: string;
  title: MessageKey;
  summary: MessageKey;
  body: () => ReactNode;
}

const P = ({ k }: { k: MessageKey }) => <p>{t(k)}</p>;

const GUIDES: Guide[] = [
  {
    id: 'diagrams',
    title: 'guideDiagramsTitle',
    summary: 'guideDiagramsSummary',
    body: () => (
      <>
        <P k="guideDiagramsP1" />
        <figure className="guide__figure guide__figure--narrow">
          <FlatFretboard
            shape={voicingToShape(0, 'maj', chordVoicings(0, 'maj')[0]!)}
            frets={5}
            colorMode="degree"
          />
        </figure>
        <P k="guideDiagramsP2" />
        <ul className="guide__legend">
          {(
            [
              ['root', 'guideDiagramsLegendRoot'],
              ['note', 'guideDiagramsLegendNote'],
              ['open', 'guideDiagramsLegendOpen'],
              ['muted', 'guideDiagramsLegendMuted'],
              ['shared', 'guideDiagramsLegendShared'],
            ] as const
          ).map(([kind, key]) => (
            <li key={kind}>
              <LegendGlyph kind={kind} />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
        <P k="guideDiagramsP3" />
        <figure className="guide__figure">
          <FlatFretboard shape={cagedChordShape(0, 'maj')} frets={15} labelMode="none" />
        </figure>
      </>
    ),
  },
  {
    id: 'library',
    title: 'guideLibraryTitle',
    summary: 'guideLibrarySummary',
    body: () => (
      <>
        <P k="guideLibraryP1" />
        <div className="guide__search" aria-hidden="true">
          <span className="guide__search-box">sad chords in G</span>
          <span className="guide__search-row is-active">G minor</span>
          <span className="guide__search-row">G minor seventh</span>
          <span className="guide__search-row">G minor sixth</span>
        </div>
        <P k="guideLibraryP2" />
        <P k="guideLibraryP3" />
        <P k="guideLibraryP4" />
        <p>
          <Link to="/library">{t('navLibrary')} →</Link>
        </p>
      </>
    ),
  },
  {
    id: 'tuning',
    title: 'guideTuningTitle',
    summary: 'guideTuningSummary',
    body: () => (
      <>
        <figure className="guide__figure">
          <MicSetupIllustration />
        </figure>
        <ol className="guide__steps">
          <li>{t('guideTuningStep1')}</li>
          <li>{t('guideTuningStep2')}</li>
          <li>{t('guideTuningStep3')}</li>
          <li>{t('guideTuningStep4')}</li>
        </ol>
        <P k="guideTuningP1" />
        <p>
          <Link to="/tools/tuner">{t('tunerTitle')} →</Link>
        </p>
      </>
    ),
  },
  {
    id: 'metronome',
    title: 'guideMetronomeTitle',
    summary: 'guideMetronomeSummary',
    body: () => (
      <>
        <figure className="guide__figure">
          <MetronomeIllustration />
        </figure>
        <P k="guideMetronomeP1" />
        <P k="guideMetronomeP2" />
        <P k="guideMetronomeP3" />
        <p>
          <Link to="/tools/metronome">{t('metronomeTitle')} →</Link>
        </p>
      </>
    ),
  },
  {
    id: 'offline',
    title: 'guideOfflineTitle',
    summary: 'guideOfflineSummary',
    body: () => (
      <>
        <figure className="guide__figure">
          <InstallIllustration />
        </figure>
        <P k="guideOfflineP1" />
        <P k="guideOfflineP2" />
        <P k="guideOfflineP3" />
        <p>
          <Link to="/settings">{t('navSettings')} →</Link>
        </p>
      </>
    ),
  },
];

export function HelpIndex() {
  return (
    <div className="screen help" data-testid="screen-help">
      <h1>{t('helpTitle')}</h1>
      <p className="screen__lede">{t('helpLede')}</p>
      <ul className="help__list">
        {GUIDES.map((guide) => (
          <li key={guide.id}>
            <Link to={`/help/${guide.id}`} className="help__card">
              <h2>{t(guide.title)}</h2>
              <p>{t(guide.summary)}</p>
            </Link>
          </li>
        ))}
      </ul>
      <section className="help__next">
        <h2>{t('helpNextTitle')}</h2>
        <p>{t('helpNextBody')}</p>
        <p className="help__version">{t('helpVersion', { version: APP_VERSION })}</p>
      </section>
    </div>
  );
}

export function HelpGuide() {
  const { guide: id } = useParams();
  const guide = GUIDES.find((g) => g.id === id);
  if (!guide) return <Navigate to="/help" replace />;
  return (
    <article className="screen help guide" data-testid={`guide-${guide.id}`}>
      <div className="tool-header">
        <Link to="/help" className="tool-header__back">
          {t('helpBack')}
        </Link>
        <h1>{t(guide.title)}</h1>
      </div>
      <p className="screen__lede">{t(guide.summary)}</p>
      <div className="guide__body">{guide.body()}</div>
    </article>
  );
}
