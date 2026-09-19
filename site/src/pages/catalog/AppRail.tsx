import { useState } from 'react';
import { useSnackbar } from '@training112/components';
import { useAuth } from '../../auth/AuthContext';
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
  const { user, logout } = useAuth();
  const snackbar = useSnackbar();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      snackbar.open({ title: 'Не удалось выйти', subtitle: error instanceof Error ? error.message : 'Попробуйте ещё раз.' });
      setIsLoggingOut(false);
    }
  };

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

      <div className={styles.trailing}>
        <IconButton
          appearance="tertiary"
          aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
          aria-pressed={isDark}
          onClick={toggleTheme}
        >
          <Icon24Theme />
        </IconButton>
        <IconButton
          appearance="tertiary"
          aria-label={`Выйти из аккаунта ${user.login}`}
          disabled={isLoggingOut}
          onClick={handleLogout}
          title="Выйти"
        >
          <svg aria-hidden="true" fill="none" height="24" viewBox="0 0 24 24" width="24">
            <path d="M9 5H5v14h4m5-11 4 4-4 4m-5-4h9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
          </svg>
        </IconButton>
      </div>
    </aside>
  );
}
