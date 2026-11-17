import { useEffect, useRef, useState } from 'react';
import { levelVerdict, METER_START, meterStep, toDb, type LevelVerdict } from '@audio/level';
import { microphone } from '@audio/microphone';
import { t, type MessageKey } from '@i18n/index';

const FLOOR_DB = -60;
const VERDICT_KEY: Record<LevelVerdict, MessageKey> = {
  silent: 'micSilent',
  quiet: 'micQuiet',
  good: 'micGood',
  loud: 'micLoud',
};

const toPercent = (db: number) => Math.max(0, Math.min(100, ((db - FLOOR_DB) / -FLOOR_DB) * 100));

/**
 * Live input level. The bar is animated directly (no React render per frame);
 * the spoken verdict updates at most a few times a second.
 */
export function InputMeter() {
  const barRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const [verdict, setVerdict] = useState<LevelVerdict>('silent');

  useEffect(() => {
    let state = METER_START;
    let last = performance.now();
    let lastVerdictAt = 0;
    let frame = 0;
    const tick = (now: number) => {
      state = meterStep(
        state,
        { rmsDb: toDb(microphone.latest.rms), peakDb: toDb(microphone.latest.peak) },
        now - last,
      );
      last = now;
      if (barRef.current) barRef.current.style.width = `${toPercent(state.levelDb)}%`;
      if (peakRef.current) peakRef.current.style.left = `${toPercent(state.peakDb)}%`;
      if (valueRef.current)
        valueRef.current.textContent = t('micLevelValue', { db: Math.round(state.levelDb) });
      if (now - lastVerdictAt > 400) {
        lastVerdictAt = now;
        setVerdict(levelVerdict(state.levelDb, state.peakDb));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="meter" data-verdict={verdict}>
      <div className="meter__head">
        <span className="meter__label">{t('micLevel')}</span>
        <span className="meter__value tabular" ref={valueRef} data-testid="mic-level" />
      </div>
      <div className="meter__track" aria-hidden="true">
        <div className="meter__zone meter__zone--quiet" />
        <div className="meter__zone meter__zone--good" />
        <div className="meter__zone meter__zone--loud" />
        <div className="meter__bar" ref={barRef} />
        <div className="meter__peak" ref={peakRef} />
      </div>
      <p className="meter__verdict" role="status" data-testid="mic-verdict">
        {t(VERDICT_KEY[verdict])}
      </p>
    </div>
  );
}
