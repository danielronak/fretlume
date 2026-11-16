import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from '@i18n/index';
import { useToast } from '@ui/index';

/**
 * Registers the service worker and tells the player when the app is ready offline
 * or when a new version is waiting. Updates apply only when the player chooses,
 * so a practice session is never interrupted by a reload.
 */
export function UpdatePrompt() {
  const toast = useToast();
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW();
  const shownOffline = useRef(false);
  const shownUpdate = useRef(false);

  useEffect(() => {
    if (offlineReady && !shownOffline.current) {
      shownOffline.current = true;
      toast.show(t('offlineReady'));
    }
  }, [offlineReady, toast]);

  useEffect(() => {
    if (needRefresh && !shownUpdate.current) {
      shownUpdate.current = true;
      toast.show(t('updateAvailable'), {
        durationMs: 0,
        action: { label: t('updateReload'), run: () => void updateServiceWorker(true) },
      });
    }
  }, [needRefresh, toast, updateServiceWorker]);

  return null;
}
