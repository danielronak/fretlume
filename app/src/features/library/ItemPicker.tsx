/** Kind / root / type selects with an Add button: picks one library item (runs, playground). */
import { useState } from 'react';
import type { LibraryKind } from '@core/theory/library/index';
import { pcPairName } from '@core/theory/pitch';
import { t } from '@i18n/index';
import { Button } from '@ui/index';
import { DEFAULT_TYPE, itemId, LIBRARY_KINDS, typeOptions } from './model';
import { KIND_TAB_LABEL } from './kindLabels';

export function ItemPicker({
  onPick,
  label,
  testPrefix = 'run',
  disabled = false,
}: {
  onPick: (itemId: string) => void;
  label: string;
  testPrefix?: string;
  disabled?: boolean;
}) {
  const [kind, setKind] = useState<LibraryKind>('chord');
  const [root, setRoot] = useState(0);
  const [typeId, setTypeId] = useState(DEFAULT_TYPE.chord);
  return (
    <div className="runs__picker">
      <label className="runs__field">
        <span>{t('runChooseKind')}</span>
        <select
          value={kind}
          data-testid={`${testPrefix}-kind`}
          onChange={(e) => {
            const k = e.target.value as LibraryKind;
            setKind(k);
            setTypeId(DEFAULT_TYPE[k]);
          }}
        >
          {LIBRARY_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(KIND_TAB_LABEL[k])}
            </option>
          ))}
        </select>
      </label>
      <label className="runs__field">
        <span>{t('runChooseRoot')}</span>
        <select
          value={root}
          data-testid={`${testPrefix}-root`}
          onChange={(e) => setRoot(Number(e.target.value))}
        >
          {Array.from({ length: 12 }, (_, pc) => (
            <option key={pc} value={pc}>
              {pcPairName(pc)}
            </option>
          ))}
        </select>
      </label>
      <label className="runs__field">
        <span>{t('runChooseType')}</span>
        <select
          value={typeId}
          data-testid={`${testPrefix}-type`}
          onChange={(e) => setTypeId(e.target.value)}
        >
          {typeOptions(kind).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <Button
        variant="primary"
        disabled={disabled}
        onClick={() => onPick(itemId(kind, root, typeId))}
        data-testid={`${testPrefix}-add`}
      >
        {label}
      </Button>
    </div>
  );
}
