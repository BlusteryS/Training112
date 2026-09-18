import {
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { classNames } from '../utils/classNames';
import styles from './Cell.module.css';

export type CellProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> & {
  after?: ReactNode;
  before?: ReactNode;
  subhead?: ReactNode;
  subtitle?: ReactNode;
  title: ReactNode;
};

export const Cell = forwardRef<HTMLDivElement, CellProps>(function Cell(
  {
    after,
    before,
    className,
    onClick,
    onKeyDown,
    subhead,
    subtitle,
    tabIndex,
    title,
    ...props
  },
  ref,
) {
  const interactive = onClick !== undefined;
  const classes = classNames(styles.cell, className);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);

    if (
      !interactive ||
      event.defaultPrevented ||
      event.target !== event.currentTarget ||
      (event.key !== 'Enter' && event.key !== ' ')
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget.click();
  };

  return (
    <div
      {...props}
      className={classes}
      data-interactive={interactive || undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      ref={ref}
      role={interactive ? 'button' : props.role}
      tabIndex={interactive ? (tabIndex ?? 0) : tabIndex}
    >
      {before !== undefined ? <span className={styles.accessory}>{before}</span> : null}

      <span className={styles.content}>
        {subhead !== undefined ? <span className={styles.secondary}>{subhead}</span> : null}
        <span className={styles.title}>{title}</span>
        {subtitle !== undefined ? <span className={styles.secondary}>{subtitle}</span> : null}
      </span>

      {after !== undefined ? <span className={styles.accessory}>{after}</span> : null}
    </div>
  );
});
