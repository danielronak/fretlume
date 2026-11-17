import type { TuningId } from '@/state/settings';
import type { MessageKey } from '@i18n/index';

export const TUNING_OPTIONS: [TuningId, MessageKey][] = [
  ['standard', 'tuningStandard'],
  ['dropD', 'tuningDropD'],
  ['halfStepDown', 'tuningHalfStepDown'],
  ['dadgad', 'tuningDadgad'],
  ['openG', 'tuningOpenG'],
  ['openD', 'tuningOpenD'],
];
