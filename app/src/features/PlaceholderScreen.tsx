import { t } from '@i18n/index';
import { Badge } from '@ui/index';
import type { Destination } from './routes';

/** Honest empty state for screens whose phase has not been built yet. */
export function PlaceholderScreen({ destination }: { destination: Destination }) {
  return (
    <section className="screen" data-testid={`screen-${destination.path.slice(1)}`}>
      <h1>{t(destination.title)}</h1>
      <p className="screen__lede">{t(destination.body)}</p>
      <Badge>{t('comingSoonBadge')}</Badge>
    </section>
  );
}
