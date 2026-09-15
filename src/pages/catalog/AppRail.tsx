import logoUrl from '../../assets/logo-light.svg';
import { ThemeIcon } from '../../icons/ThemeIcon';
import { useTheme } from '../../theme/useTheme';
import styles from './AppRail.module.css';

export function AppRail() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <aside aria-label="Панель приложения" className={styles.rail}>
      <div className={styles.logo}>
        <img alt="UIKit" height={24} src={logoUrl} width={24} />
      </div>

      <button
        aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
        aria-pressed={isDark}
        className={styles.themeButton}
        onClick={toggleTheme}
        type="button"
      >
        <ThemeIcon />
      </button>
    </aside>
  );
}
