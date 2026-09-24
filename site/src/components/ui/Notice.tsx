import styles from './controls.module.css';

export function Notice({ children, error }: { children: string; error?: boolean }) {
  return <div className={error ? `${styles.notice} ${styles.error}` : styles.notice} role={error ? 'alert' : 'status'}>{children}</div>;
}
