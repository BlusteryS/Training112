import logoUrl from '../../assets/logo-light.svg';
import { IconButton } from '@training112/components/IconButton';
import { Icon24Menu, Icon24Theme } from '@training112/icons';
import { useTheme } from '../../theme/useTheme';
import styles from './AppRail.module.css';

type AppRailProps = {
  isNavigationOpen: boolean;
  onNavigationToggle: () => void;
};

export function AppRail({ isNavigationOpen, onNavigationToggle }: AppRailProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <aside aria-label="Панель приложения" className={styles.rail}>
      <div className={styles.leading}>
        <IconButton
          aria-controls="catalog-sidebar"
          aria-expanded={isNavigationOpen}
          aria-label={isNavigationOpen ? 'Закрыть меню' : 'Открыть меню'}
          className={styles.menuButton}
          onClick={onNavigationToggle}
        >
          <Icon24Menu />
        </IconButton>

        <div className={styles.logo}>
          <img alt="Training112" height={24} src={logoUrl} width={24} />
        </div>
      </div>

      <IconButton
        appearance="tertiary"
        aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
        aria-pressed={isDark}
        onClick={toggleTheme}
      >
        <Icon24Theme />
      </IconButton>
    </aside>
  );
}
