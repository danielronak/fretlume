import { useEffect, useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useSettings } from '@/state/settings';
import type { LibraryKind } from '@core/theory/library/index';
import { pcPairName } from '@core/theory/pitch';
import { TUNINGS } from '@core/theory/tuning';
import { t, type MessageKey } from '@i18n/index';
import { Chip, useToast } from '@ui/index';
import {
  DEFAULT_TYPE,
  isLibraryKind,
  isValidType,
  itemDetails,
  LIBRARY_KINDS,
  libraryPath,
  parseRootSlug,
  relatedItems,
  typeOptions,
} from './model';
import { FavouriteButton, FolderButton } from './SaveButtons';
import { Saved } from './Saved';
import { SearchBox } from './SearchBox';
import { ArpeggioView, ChordView, KeyView, ScaleView, TriadView, type ViewProps } from './views';
import './library.css';

export const KIND_TAB_LABEL: Record<LibraryKind, MessageKey> = {
  chord: 'libKindChord',
  scale: 'libKindScale',
  triad: 'libKindTriad',
  key: 'libKindKey',
  arpeggio: 'libKindArpeggio',
};

const VIEWS: Record<LibraryKind, (props: ViewProps) => React.JSX.Element | null> = {
  chord: ChordView,
  scale: ScaleView,
  triad: TriadView,
  key: KeyView,
  arpeggio: ArpeggioView,
};

/** Kind tabs as links, so every view has its own address. */
function KindTabs({ active, root }: { active: LibraryKind | 'saved'; root: number }) {
  return (
    <nav className="lib-tabs" aria-label={t('libKindsLabel')}>
      {LIBRARY_KINDS.map((kind) => (
        <Link
          key={kind}
          to={libraryPath(kind, root, DEFAULT_TYPE[kind])}
          className="lib-tabs__tab"
          aria-current={active === kind ? 'page' : undefined}
        >
          {t(KIND_TAB_LABEL[kind])}
        </Link>
      ))}
      <Link
        to="/library/saved"
        className="lib-tabs__tab"
        aria-current={active === 'saved' ? 'page' : undefined}
      >
        {t('libSaved')}
      </Link>
    </nav>
  );
}

function Frame({
  children,
  active,
  root,
}: {
  children: React.ReactNode;
  active: LibraryKind | 'saved';
  root: number;
}) {
  return (
    <div className="screen library" data-testid="screen-library">
      <h1>{t('libraryTitle')}</h1>
      <SearchBox />
      <KindTabs active={active} root={root} />
      {children}
    </div>
  );
}

export function SavedScreen() {
  return (
    <Frame active="saved" root={0}>
      <Saved />
    </Frame>
  );
}

/** /library/:kind/:root/:type */
export function LibraryScreen() {
  const params = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const kind = isLibraryKind(params.kind) ? params.kind : null;
  const root = parseRootSlug(params.root);
  const typeId = params.type ?? '';
  const valid = kind !== null && root !== null && isValidType(kind, typeId);

  useEffect(() => {
    if (!valid && params.kind) toast.show(t('libNotFound'));
  }, [valid, params.kind, toast]);

  const tuning = TUNINGS[settings.tuning];
  const frets = settings.guitar === 'electric' ? 22 : 15;
  const leftHanded = settings.handedness === 'left';
  const details = useMemo(
    () => (valid ? itemDetails(kind, root, typeId) : null),
    [valid, kind, root, typeId],
  );

  if (!valid || !details) return <Navigate to={libraryPath('chord', 0, 'maj')} replace />;

  const View = VIEWS[kind];
  const related = relatedItems(kind, root, typeId);
  const name = details.symbol ?? details.title;

  return (
    <Frame active={kind} root={root}>
      <div className="lib-pickers">
        <div className="lib-chips">
          <span className="lib-chips__label">{t('libRoot')}</span>
          <div className="lib-roots" role="group" aria-label={t('libRoot')}>
            {Array.from({ length: 12 }, (_, pc) => (
              <Chip
                key={pc}
                selected={pc === root}
                onToggle={() => navigate(libraryPath(kind, pc, typeId))}
              >
                {pcPairName(pc)}
              </Chip>
            ))}
          </div>
        </div>
        <div className="lib-chips">
          <label className="lib-chips__label" htmlFor="lib-type">
            {t('libType')}
          </label>
          <select
            id="lib-type"
            className="select"
            value={typeId}
            onChange={(e) => navigate(libraryPath(kind, root, e.target.value))}
          >
            {typeOptions(kind).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <header className="lib-item">
        <div className="lib-item__title">
          <h2>{details.title}</h2>
          <div className="lib-item__actions">
            <FavouriteButton itemId={details.id} name={name} />
            <FolderButton itemId={details.id} name={name} />
          </div>
        </div>
        <dl className="lib-item__facts">
          <div>
            <dt>{t('libNotes')}</dt>
            <dd data-testid="item-notes">{details.notes.join(' ')}</dd>
          </div>
          <div>
            <dt>{kind === 'key' ? t('libChords') : t('libFormula')}</dt>
            <dd>{details.formula.join(' ')}</dd>
          </div>
        </dl>
        {settings.tuning !== 'standard' ? (
          <p className="lib-hint">{t('libTuningNote', { tuning: tuning.name })}</p>
        ) : null}
      </header>

      {/* Keyed by item so view-local choices (selected voicing, filters) reset on navigation. */}
      <View
        key={details.id}
        root={root}
        typeId={typeId}
        tuning={tuning}
        frets={frets}
        leftHanded={leftHanded}
      />

      {related.length > 0 ? (
        <section className="lib-section" aria-label={t('libRelated')}>
          <h3>{t('libRelated')}</h3>
          <ul className="lib-related">
            {related.map((link) => (
              <li key={link.path}>
                <Link to={link.path}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Frame>
  );
}
