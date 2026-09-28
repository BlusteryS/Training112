import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import styles from './Notifications.module.css';

type NotificationKind = 'info' | 'error';
type NotificationItem = { id: number; kind: NotificationKind; message: string };
type Notify = (message: string, kind?: NotificationKind) => void;

const NotificationContext = createContext<Notify | null>(null);
let nextId = 1;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const notify = useCallback<Notify>((message, kind = 'info') => {
    const text = message.trim();
    if (!text) return;
    setItems((current) => [...current, { id: nextId++, kind, message: text }]);
  }, []);
  const firstId = items[0]?.id;
  useEffect(() => {
    if (firstId === undefined) return;
    const timer = window.setTimeout(() => {
      setItems((current) => current[0]?.id === firstId ? current.slice(1) : current);
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [firstId]);

  return <NotificationContext.Provider value={notify}>
    {children}
    <div className={styles.stack} aria-live="polite">
      {items.map((item) => <div className={`${styles.snackbar} ${styles[item.kind]}`} key={item.id}
        role={item.kind === 'error' ? 'alert' : 'status'}>
        <span>{item.message}</span>
        <button onClick={() => setItems((current) => current.filter(({ id }) => id !== item.id))}
          aria-label="Закрыть уведомление">×</button>
      </div>)}
    </div>
  </NotificationContext.Provider>;
}

export function useNotification() {
  const notify = useContext(NotificationContext);
  if (!notify) throw new Error('useNotification requires NotificationProvider');
  return notify;
}
