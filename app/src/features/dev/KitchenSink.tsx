import { useState } from 'react';
import { t } from '@i18n/index';
import { Icon } from '@ui/icons';
import {
  Badge,
  Button,
  Card,
  Chip,
  Dialog,
  IconButton,
  Slider,
  Tabs,
  Toggle,
  useToast,
} from '@ui/index';

const shapes = [
  ['C', 'var(--shape-c)'],
  ['A', 'var(--shape-a)'],
  ['G', 'var(--shape-g)'],
  ['E', 'var(--shape-e)'],
  ['D', 'var(--shape-d)'],
] as const;

const fingers = [
  ['1', 'var(--finger-1)'],
  ['2', 'var(--finger-2)'],
  ['3', 'var(--finger-3)'],
  ['4', 'var(--finger-4)'],
] as const;

/** Developer route: every primitive on one page for visual review in both themes. */
export function KitchenSink() {
  const toast = useToast();
  const [tab, setTab] = useState('chords');
  const [selected, setSelected] = useState<Record<string, boolean>>({ C: true });
  const [size, setSize] = useState(1);
  const [mirror, setMirror] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const tabItems = (
    [
      ['chords', 'kitchenTabChords'],
      ['scales', 'kitchenTabScales'],
      ['triads', 'kitchenTabTriads'],
      ['keys', 'kitchenTabKeys'],
    ] as const
  ).map(([id, key]) => ({
    id,
    label: t(key),
    panel: <p>{t('kitchenTabPanel', { name: t(key) })}</p>,
  }));

  return (
    <section className="screen" data-testid="screen-kitchen-sink">
      <h1>{t('kitchenTitle')}</h1>
      <p className="screen__lede">{t('kitchenIntro')}</p>

      <div className="screen__section">
        <h2>{t('kitchenButtons')}</h2>
        <div className="row">
          <Button variant="primary">{t('kitchenPrimary')}</Button>
          <Button>{t('kitchenSecondary')}</Button>
          <Button variant="ghost">{t('kitchenGhost')}</Button>
          <Button variant="danger">{t('kitchenDanger')}</Button>
          <Button disabled>{t('kitchenDisabled')}</Button>
          <IconButton label={t('navSettings')}>
            <Icon name="settings" />
          </IconButton>
          <Badge>{t('comingSoonBadge')}</Badge>
        </div>
      </div>

      <div className="screen__section">
        <h2>{t('kitchenChips')}</h2>
        <div className="row">
          {shapes.map(([name, colour]) => (
            <Chip
              key={name}
              swatch={colour}
              selected={Boolean(selected[name])}
              onToggle={(next) => setSelected((s) => ({ ...s, [name]: next }))}
            >
              {name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="screen__section">
        <h2>{t('kitchenTabs')}</h2>
        <Tabs label={t('kitchenTabs')} items={tabItems} value={tab} onChange={setTab} />
      </div>

      <div className="screen__section">
        <h2>{t('kitchenCards')}</h2>
        <div className="grid">
          {[0, 1, 2].map((i) => (
            <Card key={i} title={t('kitchenCardTitle')}>
              {t('kitchenCardBody')}
            </Card>
          ))}
        </div>
      </div>

      <div className="screen__section">
        <h2>{t('kitchenControls')}</h2>
        <div className="grid">
          <Slider
            label={t('kitchenSlider')}
            value={size}
            min={0.6}
            max={1.6}
            step={0.1}
            onChange={setSize}
            format={(v) => `${v.toFixed(1)}×`}
          />
          <Toggle label={t('kitchenToggle')} checked={mirror} onChange={setMirror} />
        </div>
        <div className="row">
          <Button onClick={() => setDialogOpen(true)}>{t('kitchenDialogOpen')}</Button>
          <Button onClick={() => toast.show(t('kitchenToastMessage'))}>
            {t('kitchenToastShow')}
          </Button>
        </div>
      </div>

      <div className="screen__section">
        <h2>{t('kitchenPalette')}</h2>
        <div className="swatches">
          {[...shapes, ...fingers].map(([name, colour]) => (
            <span key={`${name}-${colour}`} className="swatch" style={{ background: colour }}>
              {name}
            </span>
          ))}
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={t('kitchenDialogTitle')}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              {t('kitchenDialogCancel')}
            </Button>
            <Button variant="danger" onClick={() => setDialogOpen(false)}>
              {t('kitchenDialogConfirm')}
            </Button>
          </>
        }
      >
        {t('kitchenDialogBody')}
      </Dialog>
    </section>
  );
}
