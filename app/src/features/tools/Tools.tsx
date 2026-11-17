import { t } from '@i18n/index';
import { MicrophonePanel } from './MicrophonePanel';
import './tools.css';

export function Tools() {
  return (
    <div className="screen tools" data-testid="screen-tools">
      <h1>{t('toolsTitle')}</h1>
      <p className="screen__lede">{t('toolsBody')}</p>
      <MicrophonePanel />
    </div>
  );
}
