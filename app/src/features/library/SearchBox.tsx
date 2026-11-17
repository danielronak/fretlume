import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchLibrary, type LibraryItem } from '@core/theory/library/index';
import { t, type MessageKey } from '@i18n/index';
import { Icon } from '@ui/icons';
import { itemPath } from './model';

const KIND_LABEL: Record<LibraryItem['kind'], MessageKey> = {
  chord: 'libKindChord',
  scale: 'libKindScale',
  triad: 'libKindTriad',
  key: 'libKindKey',
  arpeggio: 'libKindArpeggio',
};

/** Instant library search (ARIA combobox): type, arrow through results, Enter to open. */
export function SearchBox() {
  const navigate = useNavigate();
  const id = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchLibrary(query, 8), [query]);
  const open = query.trim().length > 0;

  const choose = (item: LibraryItem | undefined) => {
    if (!item) return;
    navigate(itemPath(item));
    setQuery('');
    setActive(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === 'Escape') {
      setQuery('');
    }
  };

  return (
    <div className="lib-search">
      <label htmlFor={`${id}-input`} className="visually-hidden">
        {t('searchLabel')}
      </label>
      <span className="lib-search__icon" aria-hidden="true">
        <Icon name="search" size={20} />
      </span>
      <input
        id={`${id}-input`}
        className="lib-search__input"
        type="search"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && results[active] ? `${id}-option-${active}` : undefined}
        placeholder={t('searchPlaceholder')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <ul
          id={`${id}-list`}
          className="lib-search__list"
          role="listbox"
          aria-label={t('searchLabel')}
        >
          {results.length === 0 ? (
            <li className="lib-search__empty" role="presentation">
              {t('searchNoResults', { query: query.trim() })}
            </li>
          ) : (
            results.map((item, index) => (
              <li
                key={item.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === active}
                className="lib-search__option"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(item)}
              >
                <span>{item.title}</span>
                <span className="lib-search__kind">{t(KIND_LABEL[item.kind])}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
