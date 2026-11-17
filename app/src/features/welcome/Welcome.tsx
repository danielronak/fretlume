import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_NAME } from '@/config';
import { useSettings, type GuitarProfileId, type Handedness } from '@/state/settings';
import { chordVoicings, voicingToShape } from '@core/theory/chords/index';
import { t } from '@i18n/index';
import { FlatFretboard } from '@overlay/FlatFretboard';
import { Button } from '@ui/index';
import './welcome.css';

const STEPS = 3;

interface ChoiceProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
  children?: ReactNode;
}

function Choice({ selected, onSelect, title, hint, children }: ChoiceProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className="welcome__choice"
      onClick={onSelect}
    >
      {children}
      <span className="welcome__choice-title">{title}</span>
      <span className="welcome__choice-hint">{hint}</span>
    </button>
  );
}

const PREVIEW = voicingToShape(0, 'maj', chordVoicings(0, 'maj')[0]!);

/** First-run welcome: what the app is, handedness, guitar type. Every step can be skipped. */
export function Welcome() {
  const navigate = useNavigate();
  const settings = useSettings();
  const [step, setStep] = useState(1);

  const finish = () => {
    settings.update({ onboarded: true });
    navigate('/today', { replace: true });
  };

  const handOptions: [Handedness, 'handRight' | 'handLeft', 'handRightHint' | 'handLeftHint'][] = [
    ['right', 'handRight', 'handRightHint'],
    ['left', 'handLeft', 'handLeftHint'],
  ];
  const guitarOptions: [
    GuitarProfileId,
    'guitarSteel' | 'guitarElectric' | 'guitarClassical',
    'guitarSteelHint' | 'guitarElectricHint' | 'guitarClassicalHint',
  ][] = [
    ['steel-acoustic', 'guitarSteel', 'guitarSteelHint'],
    ['electric', 'guitarElectric', 'guitarElectricHint'],
    ['classical', 'guitarClassical', 'guitarClassicalHint'],
  ];

  return (
    <main className="welcome" data-testid="screen-welcome" aria-label={t('welcomeLabel')}>
      <div className="welcome__top">
        <img src={`${import.meta.env.BASE_URL}icons/mark.svg`} alt="" width="40" height="40" />
        <span className="welcome__step" aria-live="polite">
          {t('welcomeStep', { n: step, total: STEPS })}
        </span>
        <Button variant="ghost" onClick={finish}>
          {t('welcomeSkip')}
        </Button>
      </div>

      <div className="welcome__body">
        {step === 1 ? (
          <>
            <h1>{t('welcomeTitle')}</h1>
            <p className="welcome__lede">{t('welcomeBody', { app: APP_NAME })}</p>
            <ul className="welcome__points">
              <li>{t('welcomePoint1')}</li>
              <li>{t('welcomePoint2')}</li>
              <li>{t('welcomePoint3')}</li>
            </ul>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h1>{t('handTitle')}</h1>
            <p className="welcome__lede">{t('handBody')}</p>
            <div className="welcome__choices" role="radiogroup" aria-label={t('handTitle')}>
              {handOptions.map(([value, title, hint]) => (
                <Choice
                  key={value}
                  selected={settings.handedness === value}
                  onSelect={() => settings.update({ handedness: value })}
                  title={t(title)}
                  hint={t(hint)}
                >
                  <span className="welcome__preview">
                    <FlatFretboard
                      shape={PREVIEW}
                      frets={5}
                      labelMode="none"
                      colorMode="degree"
                      leftHanded={value === 'left'}
                    />
                  </span>
                </Choice>
              ))}
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h1>{t('guitarTitle')}</h1>
            <p className="welcome__lede">{t('guitarBody')}</p>
            <div className="welcome__choices" role="radiogroup" aria-label={t('guitarTitle')}>
              {guitarOptions.map(([value, title, hint]) => (
                <Choice
                  key={value}
                  selected={settings.guitar === value}
                  onSelect={() => settings.update({ guitar: value })}
                  title={t(title)}
                  hint={t(hint)}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="welcome__nav">
        {step > 1 ? (
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            {t('welcomeBack')}
          </Button>
        ) : (
          <span />
        )}
        <div className="welcome__dots" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, i) => (
            <span key={i} className={i + 1 === step ? 'is-active' : ''} />
          ))}
        </div>
        {step < STEPS ? (
          <Button variant="primary" onClick={() => setStep(step + 1)}>
            {t('welcomeNext')}
          </Button>
        ) : (
          <Button variant="primary" onClick={finish}>
            {t('welcomeDone')}
          </Button>
        )}
      </div>
    </main>
  );
}
