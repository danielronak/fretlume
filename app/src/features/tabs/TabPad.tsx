/** Touch editing: fret pad, techniques, note lengths and beat/bar tools (phase 5 task 5.5). */
import { useState } from 'react';
import type { EditAction } from '@core/tab/edit';
import { TPQ, type Technique } from '@core/tab/model';
import { t, type MessageKey } from '@i18n/index';
import { Button } from '@ui/index';

const TECHS: [Technique, string, MessageKey][] = [
  ['h', 'h', 'techH'],
  ['p', 'p', 'techP'],
  ['/', '/', 'techSlideUp'],
  ['\\', '\\', 'techSlideDown'],
  ['b', 'b', 'techB'],
  ['r', 'r', 'techR'],
  ['x', 'x', 'techX'],
  ['~', '~', 'techVibrato'],
  ['pm', 'PM', 'techPm'],
];

export const DURATIONS: [number, MessageKey][] = [
  [TPQ * 4, 'durWhole'],
  [TPQ * 2, 'durHalf'],
  [TPQ, 'durQuarter'],
  [TPQ / 2, 'durEighth'],
  [TPQ / 4, 'durSixteenth'],
  [TPQ / 8, 'durThirtySecond'],
];

export function durationName(ticks: number): string {
  for (const [d, key] of DURATIONS) {
    if (ticks === d) return t(key);
    if (ticks === d * 1.5) return t('durDotted', { name: t(key).toLowerCase() });
  }
  return t('durTicks', { ticks });
}

const DURATION_GLYPH: Record<number, string> = {
  [TPQ * 4]: '1',
  [TPQ * 2]: '½',
  [TPQ]: '¼',
  [TPQ / 2]: '⅛',
  [TPQ / 4]: '1/16',
  [TPQ / 8]: '1/32',
};

export function TabPad({
  dispatch,
  fret,
  tech,
  durTicks,
}: {
  dispatch: (a: EditAction) => void;
  fret: number | null;
  tech: Technique | undefined;
  durTicks: number;
}) {
  const [high, setHigh] = useState(false);
  const frets = high
    ? Array.from({ length: 12 }, (_, i) => i + 13)
    : Array.from({ length: 13 }, (_, i) => i);
  const base =
    durTicks % 3 === 0 && DURATIONS.some(([d]) => d * 1.5 === durTicks) ? durTicks / 1.5 : durTicks;
  const dotted = base !== durTicks;
  return (
    <div className="tabpad" data-testid="tab-pad">
      <section className="tabpad__group" aria-label={t('tabPadTitle')}>
        <div className="tabpad__frets">
          {frets.map((f) => (
            <button
              key={f}
              type="button"
              className={`tabpad__key${fret === f ? ' is-on' : ''}`}
              data-testid={`pad-fret-${f}`}
              onClick={() => dispatch({ type: 'fret', fret: f })}
            >
              {f}
            </button>
          ))}
          <button
            type="button"
            className="tabpad__key tabpad__key--wide"
            onClick={() => setHigh((h) => !h)}
          >
            {high ? t('tabPadLow') : t('tabPadHigh')}
          </button>
          <button
            type="button"
            className="tabpad__key tabpad__key--wide"
            onClick={() => dispatch({ type: 'clear' })}
          >
            {t('tabPadClear')}
          </button>
        </div>
      </section>
      <section className="tabpad__group" aria-label={t('tabPadTechTitle')}>
        <div className="tabpad__row">
          {TECHS.map(([value, glyph, label]) => (
            <button
              key={value}
              type="button"
              className={`tabpad__key${tech === value ? ' is-on' : ''}`}
              aria-label={t(label)}
              aria-pressed={tech === value}
              title={t(label)}
              data-testid={`pad-tech-${value === '\\' ? 'down' : value === '/' ? 'up' : value}`}
              disabled={fret === null}
              onClick={() => dispatch({ type: 'tech', tech: value })}
            >
              {glyph}
            </button>
          ))}
        </div>
      </section>
      <section className="tabpad__group" aria-label={t('tabPadDurationTitle')}>
        <div className="tabpad__row">
          {DURATIONS.map(([ticks, label]) => (
            <button
              key={ticks}
              type="button"
              className={`tabpad__key${base === ticks ? ' is-on' : ''}`}
              aria-label={t(label)}
              aria-pressed={base === ticks}
              title={t(label)}
              data-testid={`pad-dur-${ticks}`}
              onClick={() => dispatch({ type: 'setDuration', ticks: dotted ? ticks * 1.5 : ticks })}
            >
              {DURATION_GLYPH[ticks]}
            </button>
          ))}
          <button
            type="button"
            className={`tabpad__key${dotted ? ' is-on' : ''}`}
            aria-pressed={dotted}
            aria-label={t('durDot')}
            title={t('durDot')}
            onClick={() => dispatch({ type: 'setDuration', ticks: dotted ? base : durTicks * 1.5 })}
          >
            ♩.
          </button>
        </div>
      </section>
      <section className="tabpad__group" aria-label={t('tabPadEditTitle')}>
        <div className="tabpad__row">
          <Button onClick={() => dispatch({ type: 'insertBeat' })} data-testid="pad-insert-beat">
            {t('tabInsertBeat')}
          </Button>
          <Button onClick={() => dispatch({ type: 'deleteBeat' })}>{t('tabDeleteBeat')}</Button>
          <Button onClick={() => dispatch({ type: 'insertBar' })} data-testid="pad-insert-bar">
            {t('tabInsertBar')}
          </Button>
          <Button onClick={() => dispatch({ type: 'deleteBar' })}>{t('tabDeleteBar')}</Button>
          <Button onClick={() => dispatch({ type: 'copyBar' })}>{t('tabCopyBar')}</Button>
          <Button onClick={() => dispatch({ type: 'pasteBar' })}>{t('tabPasteBar')}</Button>
          <Button onClick={() => dispatch({ type: 'undo' })} data-testid="pad-undo">
            {t('tabUndo')}
          </Button>
          <Button onClick={() => dispatch({ type: 'redo' })}>{t('tabRedo')}</Button>
        </div>
      </section>
    </div>
  );
}
