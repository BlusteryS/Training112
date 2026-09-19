import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type AnimationEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { IconButton } from '../IconButton';
import { Icon24Close } from '@training112/icons';
import styles from './ModalForm.module.css';

export type ModalSize = 'small' | 'medium' | 'large';

export type ModalFormProps = {
  actions?: ReactNode;
  children: ReactNode;
  footerBefore?: ReactNode;
  onClose: () => void;
  size?: ModalSize;
  subtitle?: ReactNode;
  title: ReactNode;
};

export function ModalForm({
  actions,
  children,
  footerBefore,
  onClose,
  size = 'large',
  subtitle,
  title,
}: ModalFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isClosing, setIsClosing] = useState(false);
  const titleId = useId();
  const subtitleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    dialog.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;

      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  const requestClose = useCallback(() => {
    setIsClosing(true);
  }, []);

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) {
      requestClose();
    }
  };

  const handleExitAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (isClosing && event.target === event.currentTarget) {
      onClose();
    }
  };

  const hasFooter = footerBefore !== undefined || actions !== undefined;

  return (
    <dialog
      aria-describedby={subtitle === undefined ? undefined : subtitleId}
      aria-labelledby={titleId}
      aria-modal="true"
      className={styles.dialog}
      data-closing={isClosing || undefined}
      data-size={size}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={handleBackdropClick}
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className={styles.surface} onAnimationEnd={handleExitAnimationEnd}>
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.heading}>
              <h2 className={styles.title} id={titleId}>
                {title}
              </h2>
              {subtitle !== undefined ? (
                <div className={styles.subtitle} id={subtitleId}>
                  {subtitle}
                </div>
              ) : null}
            </div>

            <IconButton
              aria-label="Закрыть"
              onClick={requestClose}
              size="medium"
            >
              <Icon24Close />
            </IconButton>
          </div>
        </header>

        <div className={styles.body}>{children}</div>

        {hasFooter ? (
          <footer className={styles.footer}>
            {footerBefore !== undefined ? (
              <div className={styles.footerBefore}>{footerBefore}</div>
            ) : null}
            {actions !== undefined ? (
              <div className={styles.actions}>{actions}</div>
            ) : null}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
