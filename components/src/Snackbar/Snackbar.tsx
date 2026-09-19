import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { Icon24Close } from '@training112/icons';
import { classNames } from '../utils/classNames';
import { IconButton } from '../IconButton';
import styles from './Snackbar.module.css';

export type SnackbarProps = Omit<HTMLAttributes<HTMLDivElement>, 'onClose' | 'title'> & {
  before?: ReactNode;
  closeLabel?: string;
  onClose?: () => void;
  subtitle?: ReactNode;
  title: ReactNode;
};

export const Snackbar = forwardRef<HTMLDivElement, SnackbarProps>(function Snackbar(
  {
    before,
    className,
    closeLabel = 'Закрыть уведомление',
    onClose,
    subtitle,
    title,
    ...props
  },
  ref,
) {
  const classes = classNames(styles.root, className);
  const hasCloseButton = onClose !== undefined;

  return (
    <div
      {...props}
      aria-atomic="true"
      className={classes}
      data-closable={hasCloseButton || undefined}
      ref={ref}
      role="status"
    >
      <div className={styles.surface}>
        <div className={styles.content}>
          {before !== undefined ? (
            <span aria-hidden="true" className={styles.before}>
              {before}
            </span>
          ) : null}

          <div className={styles.text}>
            <div className={styles.title}>{title}</div>
            {subtitle !== undefined ? (
              <div className={styles.subtitle}>{subtitle}</div>
            ) : null}
          </div>
        </div>
      </div>

      {hasCloseButton ? (
        <div className={styles.closeSlot}>
          <IconButton
            appearance="tertiary"
            aria-label={closeLabel}
            className={styles.closeButton}
            onClick={onClose}
            size="medium"
          >
            <Icon24Close height={20} width={20} />
          </IconButton>
        </div>
      ) : null}
    </div>
  );
});
