import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './ModalForm.module.css';

export function ModalForm({ label, children }: { label: string; children: ReactNode }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  return createPortal(
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label={label}>{children}</div>,
    document.body,
  );
}
