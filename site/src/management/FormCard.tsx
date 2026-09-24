import type { ReactNode } from 'react';
import closeIcon from '../assets/workspace/close.svg';
import styles from './FormCard.module.css';

export function FormCard({ title, onClose, children, submitLabel, onSubmit, busy, error }: {
  title: string;
  onClose: () => void;
  children?: ReactNode;
  submitLabel?: string;
  onSubmit?: () => void;
  busy?: boolean;
  error?: string;
}) {
  return <div className={styles.card}>
    <button className={styles.close} type="button" onClick={onClose} aria-label="Закрыть">
      <img src={closeIcon} alt="" />
    </button>
    <div className={styles.title}>{title}</div>
    {children}
    {error && <div className={styles.error} role="alert">{error}</div>}
    {submitLabel && <button className={styles.submit} type="button" disabled={busy} onClick={onSubmit}>{submitLabel}</button>}
  </div>;
}

export const formGrid = styles.grid;
export const formChoice = styles.choice;
export const formCheck = styles.check;
