import type { LibraryKind } from '@core/theory/library/index';
import type { MessageKey } from '@i18n/index';

export const KIND_TAB_LABEL: Record<LibraryKind, MessageKey> = {
  chord: 'libKindChord',
  scale: 'libKindScale',
  triad: 'libKindTriad',
  key: 'libKindKey',
  arpeggio: 'libKindArpeggio',
};
