import {
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import styles from './Cell.module.css';

export type CellProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> & {
  /** Content rendered after the text. */
  after?: ReactNode;
  /** Content rendered before the text. */
  before?: ReactNode;
  /** Text displayed above the title. */
  subhead?: ReactNode;
  /** Additional text displayed below the title. */
  subtitle?: ReactNode;
  /** Main cell content. */
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
  const classes = [styles.cell, className].filter(Boolean).join(' ');

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
