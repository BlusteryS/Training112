import { useCallback, useEffect, useState } from 'react';
import { applyTheme, getPreferredTheme, getStoredTheme, storeTheme, type Theme } from './theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getPreferredTheme);

  const changeTheme = useCallback((nextTheme: Theme, persist = true) => {
    applyTheme(nextTheme);
    if (persist) {
      storeTheme(nextTheme);
    }
    setTheme(nextTheme);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      if (!getStoredTheme()) {
        changeTheme(event.matches ? 'dark' : 'light', false);
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, [changeTheme]);

  const toggleTheme = useCallback(() => {
    changeTheme(theme === 'light' ? 'dark' : 'light');
  }, [changeTheme, theme]);

  return { theme, toggleTheme };
}
