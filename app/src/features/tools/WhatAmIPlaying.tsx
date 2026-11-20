/**
 * /tools/what — "What am I playing?" (phase 6 task 6.6, docs/specs/02-audio.md §4.8): the listener's
 * chroma suggestions, smoothed, with a link to the chord in the library. A suggestion only.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChordSmoother, type ChordGuess } from '@audio/analysis/chroma';
import { listener } from '@audio/listener/listener';
import { useMicrophone } from '@audio/useMicrophone';
import { NOTE_NAMES_SHARP } from '@audio/analysis/names';
import { t } from '@i18n/index';
import { MicrophonePanel } from './MicrophonePanel';
import './tools.css';

/** Library address of a guessed chord ("C#" → "Cs"). */
const libraryPath = (g: ChordGuess) =>
  `/library/chord/${NOTE_NAMES_SHARP[g.root]!.replace('#', 's')}/${g.quality}`;

export function WhatAmIPlaying() {
  const mic = useMicrophone();
  const [guesses, setGuesses] = useState<ChordGuess[]>([]);
  const [stable, setStable] = useState<string | null>(null);
  const smoother = useRef(new ChordSmoother(6));
  const [quietSince, setQuietSince] = useState(0);

  useEffect(() => {
    if (mic.status !== 'running') return;
    listener.start();
    listener.suggest(true);
    const off = listener.on((ev) => {
      if (ev.type === 'level') setQuietSince((q) => (ev.rms < 0.004 ? q + 1 : 0));
      if (ev.type !== 'suggest') return;
      setGuesses(ev.guesses);
      setStable(smoother.current.push(ev.guesses[0]?.symbol ?? null));
    });
    return () => {
      off();
      listener.suggest(false);
      listener.stop();
    };
  }, [mic.status]);

  const quiet = quietSince > 10; // about a second of silence
  const top = guesses.find((g) => g.symbol === stable) ?? guesses[0];
  return (
    <div className="screen tools" data-testid="screen-what">
      <div className="tool-header">
        <Link to="/tools" className="tool-header__back">
          {t('toolsTitle')}
        </Link>
        <h1>{t('whatTitle')}</h1>
      </div>
      <p className="screen__lede">{t('whatLede')}</p>
      {mic.status === 'running' ? (
        <section className="tool-panel what" aria-live="polite">
          {quiet || !top ? (
            <p className="tool-panel__body">{t('whatWaiting')}</p>
          ) : (
            <>
              <p className="what__big" data-testid="what-chord">
                {stable ?? top.symbol}
              </p>
              <p className="tool-panel__body">
                {t('whatOthers', {
                  chords: guesses
                    .filter((g) => g.symbol !== (stable ?? top.symbol))
                    .map((g) => g.symbol)
                    .join(', '),
                })}
              </p>
              <Link className="btn btn--secondary" to={libraryPath(top)}>
                {t('whatOpen', { chord: stable ?? top.symbol })}
              </Link>
            </>
          )}
          <p className="tool-panel__body what__note">{t('whatNote')}</p>
        </section>
      ) : null}
      <MicrophonePanel />
    </div>
  );
}
