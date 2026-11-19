/** /playground — free exploration (phase 5 task 5.3, parity P-F13). */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '@/state/settings';
import { parseProgression } from '@core/theory/chords/parse';
import { pcPairName } from '@core/theory/pitch';
import { TUNINGS } from '@core/theory/tuning';
import { libraryItem } from '@core/theory/library/index';
import { t } from '@i18n/index';
import {
  addLayer,
  goToChord,
  LAYER_COLOR_COUNT,
  MAX_LAYERS,
  mergeLayers,
  removeLayer,
  stepEntry,
  transposeAll,
  updateLayer,
  type PlaygroundState,
} from '@learn/playground';
import { LAYER_COLORS } from '@overlay/display';
import { FlatFretboard } from '@overlay/FlatFretboard';
import { Icon } from '@ui/icons';
import { Button, IconButton, Toggle } from '@ui/index';
import { ItemPicker } from '@features/library/ItemPicker';
import { loadPlayground, playgroundTitle, resolveLayers, savePlayground } from './model';
import '@features/runs/runs.css';
import './playground.css';

export function Playground() {
  const settings = useSettings();
  const navigate = useNavigate();
  const tuning = TUNINGS[settings.tuning];
  const frets = settings.guitar === 'electric' ? 22 : 15;
  const [state, setState] = useState<PlaygroundState>(() => loadPlayground());
  useEffect(() => savePlayground(state), [state]);

  const layers = useMemo(() => resolveLayers(state, tuning, frets), [state, tuning, frets]);
  const title = playgroundTitle(layers);
  const shape = useMemo(() => mergeLayers(layers, title), [layers, title]);
  const progression = useMemo(() => parseProgression(state.progression), [state.progression]);
  const rootPc = layers[0] ? libraryItem(layers[0].layer.itemId)?.root : undefined;

  return (
    <div className="screen playground" data-testid="screen-playground">
      <h1>{t('playgroundTitle')}</h1>
      <p className="screen__lede">{t('playgroundIntro')}</p>

      <section className="lib-section">
        <ItemPicker
          label={t('playgroundAddLayer')}
          testPrefix="pg"
          disabled={state.layers.length >= MAX_LAYERS}
          onPick={(id) => setState((s) => addLayer(s, id))}
        />
        {state.layers.length >= MAX_LAYERS ? (
          <p className="lib-hint">{t('playgroundLayersFull')}</p>
        ) : null}
      </section>

      {layers.length === 0 ? (
        <p className="lib-hint">{t('playgroundEmpty')}</p>
      ) : (
        <>
          <div className="playground__bar">
            <span>{t('playgroundRoot')}</span>
            <IconButton
              label={t('playgroundRootDown')}
              onClick={() => setState((s) => transposeAll(s, -1))}
              data-testid="pg-root-down"
            >
              −
            </IconButton>
            <strong data-testid="pg-root-name">
              {rootPc === undefined ? '' : pcPairName(rootPc)}
            </strong>
            <IconButton
              label={t('playgroundRootUp')}
              onClick={() => setState((s) => transposeAll(s, 1))}
              data-testid="pg-root-up"
            >
              +
            </IconButton>
            <Button
              variant="primary"
              onClick={() => navigate('/stage/playground')}
              data-testid="pg-to-stage"
            >
              {t('playgroundToStage')}
            </Button>
          </div>

          <div className="playground__board" data-testid="pg-board">
            <FlatFretboard
              shape={shape}
              frets={frets}
              labelMode={settings.labelMode}
              colorMode="group"
              leftHanded={settings.handedness === 'left'}
            />
          </div>

          <ol className="runs__cards playground__layers">
            {layers.map((l, i) => (
              <li key={i} className="runs__card" data-testid="pg-layer">
                <div className="runs__card-head">
                  <strong>
                    <span
                      className="playground__swatch"
                      style={{ background: LAYER_COLORS[l.layer.color] }}
                    />
                    {l.title}
                  </strong>
                  <div className="runs__card-tools">
                    <IconButton
                      label={t('playgroundRemove', { name: l.title })}
                      onClick={() => setState((s) => removeLayer(s, i))}
                    >
                      <Icon name="close" size={18} />
                    </IconButton>
                  </div>
                </div>
                <div className="runs__card-fields">
                  {l.entryLabels.length > 1 ? (
                    <div className="playground__stepper">
                      <IconButton
                        label={t('playgroundPrevShape', { name: l.title })}
                        onClick={() => setState((s) => stepEntry(s, i, -1, l.entryLabels.length))}
                      >
                        ◄
                      </IconButton>
                      <span data-testid="pg-layer-shape">
                        {l.entryLabels[Math.min(l.layer.entry, l.entryLabels.length - 1)]}
                      </span>
                      <IconButton
                        label={t('playgroundNextShape', { name: l.title })}
                        onClick={() => setState((s) => stepEntry(s, i, 1, l.entryLabels.length))}
                      >
                        ►
                      </IconButton>
                    </div>
                  ) : null}
                  <div
                    className="playground__colours"
                    role="radiogroup"
                    aria-label={t('playgroundColour', { name: l.title })}
                  >
                    {Array.from({ length: LAYER_COLOR_COUNT }, (_, c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={l.layer.color === c}
                        className="playground__colour"
                        style={{ background: LAYER_COLORS[c] }}
                        onClick={() => setState((s) => updateLayer(s, i, { color: c }))}
                      />
                    ))}
                  </div>
                  <Toggle
                    label={t('playgroundFaint')}
                    checked={l.layer.faint}
                    onChange={(faint) => setState((s) => updateLayer(s, i, { faint }))}
                  />
                  <Toggle
                    label={t('playgroundVisible')}
                    checked={l.layer.visible}
                    onChange={(visible) => setState((s) => updateLayer(s, i, { visible }))}
                  />
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      <section className="lib-section">
        <h2>{t('playgroundProgression')}</h2>
        <p className="lib-hint">{t('playgroundProgressionHint')}</p>
        <input
          className="text-input"
          value={state.progression}
          maxLength={200}
          placeholder="C G Am F"
          data-testid="pg-progression"
          onChange={(e) => setState((s) => ({ ...s, progression: e.target.value, chordIndex: 0 }))}
        />
        {progression.unknown.length ? (
          <p className="lib-hint" role="status">
            {t('playgroundProgressionUnknown', { tokens: progression.unknown.join(' ') })}
          </p>
        ) : null}
        {progression.chords.length ? (
          <div className="playground__strip">
            <IconButton
              label={t('playgroundPrevChord')}
              onClick={() => setState((s) => goToChord(s, progression.chords, s.chordIndex - 1))}
            >
              ◄
            </IconButton>
            {progression.chords.map((c, i) => (
              <button
                key={i}
                type="button"
                className="playground__chord"
                aria-pressed={i === state.chordIndex}
                data-testid="pg-chord"
                onClick={() => setState((s) => goToChord(s, progression.chords, i))}
              >
                {c.symbol}
              </button>
            ))}
            <IconButton
              label={t('playgroundNextChord')}
              onClick={() => setState((s) => goToChord(s, progression.chords, s.chordIndex + 1))}
              data-testid="pg-next-chord"
            >
              ►
            </IconButton>
          </div>
        ) : null}
      </section>
    </div>
  );
}
