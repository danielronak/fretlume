import { useCallback, useEffect } from 'react';
import { useSettings, type Theme } from '@/state/settings';

export type { Theme };

/** Theme lives in the settings store and on <html data-theme>; index.html applies it before first paint. */
export function useTheme(): [Theme, () => void] {
  const theme = useSettings((s) => s.theme);
  const update = useSettings((s) => s.update);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#141210' : '#faf7f2');
  }, [theme]);

  const toggle = useCallback(
    () => update({ theme: theme === 'dark' ? 'light' : 'dark' }),
    [theme, update],
  );
  return [theme, toggle];
}
