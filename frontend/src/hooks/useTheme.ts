import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

/** Shared with the pre-paint script in index.html. */
const STORAGE_KEY = 'enem-theme';

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function hasStoredTheme(): boolean {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark';
  } catch {
    return false;
  }
}

/**
 * Theme state for the toggle. The initial value is read back off the <html>
 * class that index.html already set, so the hook agrees with what is on screen
 * rather than recomputing it and risking a mismatch.
 *
 * Nothing is written to storage until the user actually picks a theme — that
 * is what keeps "follow the OS" working for visitors who never touch it.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );
  const [followSystem, setFollowSystem] = useState(() => !hasStoredTheme());

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    if (!followSystem) return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTheme(prefersDark() ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [followSystem]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Not persisting is survivable; the theme still holds for this session.
      }
      return next;
    });
    setFollowSystem(false);
  }, []);

  return { theme, toggle };
}
