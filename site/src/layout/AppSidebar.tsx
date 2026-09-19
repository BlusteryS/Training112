import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { IconButton } from '@training112/components/IconButton';
import { Menu } from '@training112/components/Menu';
import { MenuItem } from '@training112/components/MenuItem';
import { Separator } from '@training112/components/Separator';
import { useSnackbar } from '@training112/components/Snackbar';
import { Tooltip } from '@training112/components/Tooltip';
import { Icon24Book, Icon24Close, Icon24Help, Icon24Logo, Icon24More, Icon24Person, Icon24Theme } from '@training112/icons';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/useTheme';
import styles from './AppSidebar.module.css';

type SidebarLinkProps = {
  icon: ReactNode;
  label: string;
  to: string;
};

function SidebarLink({ icon, label, to }: SidebarLinkProps) {
  return (
    <Tooltip placement="right" title={label}>
      <NavLink aria-label={label} className={styles.link} end={to === '/'} to={to}>
        {icon}
      </NavLink>
    </Tooltip>
  );
}

export function AppSidebar() {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const snackbar = useSnackbar();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const isDark = theme === 'dark';
  const themeLabel = isDark ? 'Включить светлую тему' : 'Включить тёмную тему';

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      snackbar.open({
        title: 'Не удалось выйти',
        subtitle: error instanceof Error ? error.message : 'Попробуйте ещё раз.',
      });
      setIsLoggingOut(false);
    }
  };

  return (
    <aside aria-label="Навигация приложения" className={styles.sidebar}>
      <div className={styles.group}>
        <NavLink aria-label="Training112 — главная" className={styles.logo} end to="/">
          <Icon24Logo />
        </NavLink>
        <Separator className={styles.separator} />
        <nav aria-label="Основные разделы" className={styles.navigation}>
          <SidebarLink icon={<Icon24Person />} label="Профиль" to="/" />
          <SidebarLink icon={<Icon24Book />} label="Документация" to="/docs" />
        </nav>
      </div>

      <div className={styles.group}>
        <Tooltip placement="right" title={themeLabel}>
          <IconButton aria-label={themeLabel} aria-pressed={isDark} onClick={toggleTheme} size="large">
            <Icon24Theme className={styles.secondaryIcon} />
          </IconButton>
        </Tooltip>
        <Separator className={styles.separator} />
        <Menu
          aria-label="Меню приложения"
          className={styles.menu}
          placement="right-end"
          selectionMode="none"
          trigger={
            <IconButton aria-label="Меню приложения" className={styles.menuButton} size="large">
              <Icon24More className={styles.secondaryIcon} />
            </IconButton>
          }
          width={304}
        >
          <MenuItem before={<Icon24Help className={styles.secondaryIcon} />}>Помощь</MenuItem>
          <Separator className={styles.separator} />
          <MenuItem
            before={<Icon24Close className={styles.dangerIcon} />}
            className={styles.logout}
            disabled={isLoggingOut}
            onClick={handleLogout}
          >
            Выйти из системы
          </MenuItem>
        </Menu>
      </div>
    </aside>
  );
}
