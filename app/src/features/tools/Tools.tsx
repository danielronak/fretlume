import { Link } from 'react-router-dom';
import { t } from '@i18n/index';
import { MicrophonePanel } from './MicrophonePanel';
import './tools.css';

export function Tools() {
  return (
    <div className="screen tools" data-testid="screen-tools">
      <h1>{t('toolsTitle')}</h1>
      <p className="screen__lede">{t('toolsLede')}</p>
      <div className="tool-cards">
        <Link to="/tools/tuner" className="tool-card">
          <h2>{t('toolTunerTitle')}</h2>
          <p>{t('toolTunerBody')}</p>
        </Link>
        <Link to="/tools/metronome" className="tool-card">
          <h2>{t('toolMetronomeTitle')}</h2>
          <p>{t('toolMetronomeBody')}</p>
        </Link>
        <Link to="/playground" className="tool-card" data-testid="tool-playground">
          <h2>{t('toolsPlayground')}</h2>
          <p>{t('toolsPlaygroundBody')}</p>
        </Link>
      </div>
      <MicrophonePanel />
    </div>
  );
}
