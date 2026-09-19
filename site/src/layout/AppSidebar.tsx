import { NavLink } from 'react-router-dom';
import { IconButton } from '@training112/components/IconButton';
import { Separator } from '@training112/components/Separator';
import { Tooltip } from '@training112/components/Tooltip';
import { Icon24Theme } from '@training112/icons';
import logoUrl from '../assets/navigation/logo.svg';
import { useTheme } from '../theme/useTheme';
import styles from './AppSidebar.module.css';

type NavigationIcon = 'profile' | 'documentation' | 'library';

type SidebarLinkProps = {
  icon: NavigationIcon;
  label: string;
  to: string;
};

function SidebarLink({ icon, label, to }: SidebarLinkProps) {
  return (
    <Tooltip placement="right" title={label}>
      <NavLink aria-label={label} className={styles.link} end={to === '/'} to={to}>
        <span aria-hidden="true" className={`${styles.icon} ${styles[icon]}`} />
      </NavLink>
    </Tooltip>
  );
}

export function AppSidebar() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const themeLabel = isDark ? 'Включить светлую тему' : 'Включить тёмную тему';

  return (
    <aside aria-label="Навигация приложения" className={styles.sidebar}>
      <div className={styles.group}>
        <NavLink aria-label="Training112 — главная" className={styles.logo} end to="/">
          <img alt="" height={24} src={logoUrl} width={24} />
        </NavLink>
        <Separator className={styles.separator} />
        <nav aria-label="Основные разделы" className={styles.navigation}>
          <SidebarLink icon="profile" label="Профиль" to="/" />
          <SidebarLink icon="documentation" label="Документация" to="/docs" />
        </nav>
      </div>

      <div className={styles.group}>
        <Tooltip placement="right" title={themeLabel}>
          <IconButton aria-label={themeLabel} aria-pressed={isDark} onClick={toggleTheme}>
            <Icon24Theme className={styles.themeIcon} />
          </IconButton>
        </Tooltip>
        <Separator className={styles.separator} />
        <nav aria-label="UI-библиотека">
          <SidebarLink icon="library" label="UI-библиотека" to="/ui" />
        </nav>
      </div>
    </aside>
  );
}
