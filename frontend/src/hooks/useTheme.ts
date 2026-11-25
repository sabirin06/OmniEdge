import { useEffect } from 'react';
import type { ThemePreference } from '../types';

const storageKey = 'omniedge-theme';

export function useTheme(preference: ThemePreference | undefined) {
  useEffect(() => {
    let selection = preference ?? 'system';
    try {
      if (preference) localStorage.setItem(storageKey, preference);
      else {
        const saved = localStorage.getItem(storageKey);
        if (saved === 'dark' || saved === 'light') selection = saved;
      }
    } catch {
      // The signed-in preference still applies when browser storage is unavailable.
    }

    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = selection === 'system' ? (dark.matches ? 'dark' : 'light') : selection;
    };
    apply();
    if (selection !== 'system') return;
    dark.addEventListener('change', apply);
    return () => dark.removeEventListener('change', apply);
  }, [preference]);
}
