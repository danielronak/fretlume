import { useSyncExternalStore } from 'react';
import { microphone, type MicSnapshot } from './microphone';

/** Current microphone state; re-renders on status or device changes (not on every block). */
export function useMicrophone(): MicSnapshot {
  return useSyncExternalStore(microphone.subscribe, microphone.getSnapshot);
}
