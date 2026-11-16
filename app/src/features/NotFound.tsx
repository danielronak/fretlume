import { Link } from 'react-router-dom';
import { t } from '@i18n/index';

export function NotFound() {
  return (
    <section className="screen" data-testid="screen-not-found">
      <h1>{t('notFoundTitle')}</h1>
      <p className="screen__lede">{t('notFoundBody')}</p>
      <Link className="btn btn--primary" to="/today">
        {t('notFoundAction')}
      </Link>
    </section>
  );
}
