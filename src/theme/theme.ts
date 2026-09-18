export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'uikit-theme';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

export function getStoredTheme(): Theme | null {
  try {
    const theme = window.localStorage.getItem(THEME_STORAGE_KEY);

    return isTheme(theme) ? theme : null;
  } catch {
    return null;
  }
}

export function getPreferredTheme(): Theme {
  const storedTheme = getStoredTheme();

  if (storedTheme) {
    return storedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;

  root.dataset.theme = theme;

  window.requestAnimationFrame(() => {
    const themeColor = window.getComputedStyle(root).getPropertyValue('--color-bg-primary').trim();
    const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

    if (themeColor && themeColorMeta) {
      themeColorMeta.content = themeColor;
    }
  });
}

export function storeTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The selected theme still works when storage is unavailable.
  }
}
