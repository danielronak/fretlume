import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TIME_SIGNATURES, useSettings } from '@/state/settings';
import { clampBpm, MAX_BPM, MIN_BPM, tapTempo, type MeterSpec } from '@audio/beats';
import { Metronome } from '@audio/metronome';
import { t, type MessageKey } from '@i18n/index';
import { Button, Chip, Slider, Toggle } from '@ui/index';
import './tools.css';

const SUBDIVISIONS: [MeterSpec['subdivision'], MessageKey][] = [
  [1, 'metronomeQuarters'],
  [2, 'metronomeEighths'],
  [3, 'metronomeTriplets'],
  [4, 'metronomeSixteenths'],
];

function meterFrom(settings: ReturnType<typeof useSettings.getState>): MeterSpec {
  const [top, bottom] = settings.metronomeTime.split('/').map(Number);
  return {
    bpm: settings.metronomeBpm,
    beatsPerBar: top ?? 4,
    beatUnit: bottom === 8 ? 8 : 4,
    subdivision: settings.metronomeSubdivision as MeterSpec['subdivision'],
    accentFirst: settings.metronomeAccent,
    countInBars: settings.metronomeCountIn ? 1 : 0,
  };
}

export function MetronomeScreen() {
  const settings = useSettings();
  const meter = useMemo(() => meterFrom(settings), [settings]);
  const metronome = useRef<Metronome | null>(null);
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState<{ beat: number; countIn: boolean; index: number } | null>(null);
  const [clicks, setClicks] = useState(0);
  const taps = useRef<number[]>([]);

  const toggle = useCallback(async () => {
    if (metronome.current?.running) {
      metronome.current.stop();
      setRunning(false);
      setBeat(null);
      return;
    }
    metronome.current ??= new Metronome(meter);
    metronome.current.update(meter);
    await metronome.current.start();
    setRunning(true);
  }, [meter]);

  // Tempo and meter changes apply live.
  useEffect(() => {
    metronome.current?.update(meter);
  }, [meter]);

  // Beat lights follow the audio clock.
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let lastIndex = -1;
    const draw = () => {
      const current = metronome.current?.current();
      if (current && current.index !== lastIndex) {
        lastIndex = current.index;
        setBeat({ beat: current.beat, countIn: current.countIn, index: current.index });
        setClicks((n) => n + 1);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  useEffect(() => () => metronome.current?.stop(), []);

  const setBpm = useCallback(
    (bpm: number) => settings.update({ metronomeBpm: clampBpm(bpm) }),
    [settings],
  );

  // Space starts and stops; arrows change tempo (not while typing in a field).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
      if (event.key === ' ') {
        event.preventDefault();
        void toggle();
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
        setBpm(settings.metronomeBpm + (event.shiftKey ? 10 : 1));
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
        setBpm(settings.metronomeBpm - (event.shiftKey ? 10 : 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, setBpm, settings.metronomeBpm]);

  const tap = () => {
    taps.current = [...taps.current, performance.now()].slice(-8);
    const bpm = tapTempo(taps.current);
    if (bpm !== null) setBpm(bpm);
  };

  return (
    <div className="screen tools metronome" data-testid="screen-metronome">
      <div className="tool-header">
        <Link to="/tools" className="tool-header__back">
          {t('toolsTitle')}
        </Link>
        <h1>{t('metronomeTitle')}</h1>
      </div>

      <section
        className="tool-panel metronome__main"
        data-testid="metronome"
        data-running={running}
        data-clicks={clicks}
      >
        <div className="metronome__lights" aria-hidden="true">
          {Array.from({ length: meter.beatsPerBar }, (_, i) => (
            <span
              key={i}
              className="metronome__light"
              data-first={i === 0}
              data-on={running && beat?.beat === i}
            />
          ))}
        </div>
        <p className="metronome__countin" aria-live="polite">
          {running && beat?.countIn ? t('metronomeCountingIn') : ' '}
        </p>
        <div className="metronome__tempo">
          <Button
            aria-label={t('metronomeSlower')}
            onClick={() => setBpm(settings.metronomeBpm - 1)}
          >
            −
          </Button>
          <output className="metronome__bpm tabular" data-testid="metronome-bpm">
            {settings.metronomeBpm}
            <small>BPM</small>
          </output>
          <Button
            aria-label={t('metronomeFaster')}
            onClick={() => setBpm(settings.metronomeBpm + 1)}
          >
            +
          </Button>
        </div>
        <Slider
          label={t('metronomeTempo')}
          value={settings.metronomeBpm}
          min={MIN_BPM}
          max={MAX_BPM}
          onChange={setBpm}
          format={(v) => t('metronomeBpm', { bpm: v })}
        />
        <div className="row metronome__actions">
          <Button variant="primary" className="metronome__start" onClick={() => void toggle()}>
            {running ? t('metronomeStop') : t('metronomeStart')}
          </Button>
          <Button onClick={tap} title={t('metronomeTapHint')}>
            {t('metronomeTap')}
          </Button>
        </div>
      </section>

      <section className="tool-panel">
        <div className="lib-chips">
          <span className="lib-chips__label">{t('metronomeTime')}</span>
          <div className="row" role="group" aria-label={t('metronomeTime')}>
            {TIME_SIGNATURES.map((sig) => (
              <Chip
                key={sig}
                selected={settings.metronomeTime === sig}
                onToggle={() => settings.update({ metronomeTime: sig })}
              >
                {sig}
              </Chip>
            ))}
          </div>
        </div>
        <div className="lib-chips">
          <span className="lib-chips__label">{t('metronomeClicks')}</span>
          <div className="row" role="group" aria-label={t('metronomeClicks')}>
            {SUBDIVISIONS.map(([value, key]) => (
              <Chip
                key={value}
                selected={settings.metronomeSubdivision === value}
                onToggle={() => settings.update({ metronomeSubdivision: value })}
              >
                {t(key)}
              </Chip>
            ))}
          </div>
        </div>
        <Toggle
          label={t('metronomeAccent')}
          checked={settings.metronomeAccent}
          onChange={(v) => settings.update({ metronomeAccent: v })}
        />
        <Toggle
          label={t('metronomeCountIn')}
          checked={settings.metronomeCountIn}
          onChange={(v) => settings.update({ metronomeCountIn: v })}
        />
        <p className="tool-panel__body">{t('metronomeKeys')}</p>
      </section>
    </div>
  );
}
