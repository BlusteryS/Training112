import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useNotification } from '../Notifications';
import helpIcon from '../../assets/workspace/help.svg';
import workstationIcon from '../../assets/workspace/workstation.svg';
import { useNow } from '../../hooks/useNow';
import styles from '../../App.module.css';

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit', minute: '2-digit', hour12: false,
});

function displayDate(value: Date) {
  const formatted = dateFormatter.format(value).replace(/\sг\.$/, '');
  return formatted.charAt(0).toLocaleUpperCase('ru') + formatted.slice(1);
}

function personLabel(role: string, login: string, workstation: string) {
  if (role === 'admin') return 'Администратор';
  if (role === 'instructor') return 'Преподаватель';
  const number = login.match(/\d+/)?.[0] ?? workstation;
  return `оп. ${number}, ${login}`;
}

export function WorkspaceHeader({ leading, footer, menu, person }: {
  leading: ReactNode;
  footer?: ReactNode;
  menu?: ReactNode;
  person?: string;
}) {
  const { user, logout } = useAuth();
  const notify = useNotification();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const now = useNow();
  useEffect(() => {
    if (!menuOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (document.querySelector('[data-modal-form]')) return;
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !document.querySelector('[data-modal-form]')) setMenuOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);
  const currentTime = new Date(now);
  const workstation = (user.workstation ?? '000').padStart(3, '0');
  return <div className={styles.operatorHeader}>
    {leading}
    <div className={styles.statusPanel}>
      <div className={styles.statusTop}>
        <div className={styles.operatorInfo}>
          <div>{displayDate(currentTime)}</div>
          <div className={styles.operatorMeta}>
            <span>{person ?? personLabel(user.role, user.login, workstation)}</span>
            <span><img src={workstationIcon} alt="" /> АРМ {workstation}</span>
            <div ref={menuRef} className={styles.helpMenu}>
              <button type="button" className={styles.helpButton} onClick={() => setMenuOpen((value) => !value)}
                title="Меню" aria-expanded={menuOpen}>
                <img src={helpIcon} alt="" />
              </button>
              {menuOpen && <div className={styles.sessionMenu}>
                {menu}
                <button onClick={() => { void logout().catch((cause: unknown) => {
                  notify(cause instanceof Error ? cause.message : 'Не удалось выйти из системы.', 'error');
                }); }}>Выйти из системы</button>
              </div>}
            </div>
          </div>
        </div>
        <div className={styles.clock}>{timeFormatter.format(currentTime)}<span>:{currentTime.getSeconds().toString().padStart(2, '0')}</span></div>
      </div>
      {footer}
    </div>
  </div>;
}
