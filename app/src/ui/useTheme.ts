import { useCallback, useEffect, useState } from 'react';
import { STORAGE_PREFIX } from '@/config';

export type Theme = 'dark' | 'light';
const KEY = `${STORAGE_PREFIX}.theme`;

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Theme lives on <html data-theme>; index.html applies the saved value before first paint. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#141210' : '#faf7f2');
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Storage can be unavailable (private mode); the theme then lasts for this visit only.
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return [theme, toggle];
}
