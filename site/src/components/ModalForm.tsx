import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './ModalForm.module.css';

export function ModalForm({ label, children, onClose }: { label: string; children: ReactNode; onClose: () => void }) {
  const backdrop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      const open = document.querySelectorAll('[data-modal-form]');
      if (event.key === 'Escape' && open[open.length - 1] === backdrop.current) {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return createPortal(
    <div ref={backdrop} data-modal-form className={styles.backdrop} role="dialog" aria-modal="true"
      aria-label={label} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      {children}
    </div>,
    document.body,
  );
}
