import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { classNames } from '../utils/classNames';
import styles from './Card.module.css';

export type CardAppearance =
  | 'default'
  | 'primary'
  | 'accent'
  | 'error'
  | 'valid'
  | 'warning'
  | 'important';

export type CardProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> & {
  after?: ReactNode;
  appearance?: CardAppearance;
  before?: ReactNode;
  children?: ReactNode;
  media?: ReactNode;
  stretched?: boolean;
  subhead?: ReactNode;
  subtitle?: ReactNode;
  title?: ReactNode;
  withBorder?: boolean;
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    after,
    appearance = 'default',
    before,
    children,
    className,
    media,
    stretched = true,
    subhead,
    subtitle,
    title,
    withBorder = false,
    ...props
  },
  ref,
) {
  const classes = classNames(styles.card, className);
  const hasHeader =
    after !== undefined ||
    before !== undefined ||
    subhead !== undefined ||
    subtitle !== undefined ||
    title !== undefined;

  const header = hasHeader ? (
    <div className={styles.header}>
      {before !== undefined ? (
        <span className={styles.accessory}>{before}</span>
      ) : null}

      {subhead !== undefined || title !== undefined || subtitle !== undefined ? (
        <div className={styles.heading}>
          {subhead !== undefined ? <div className={styles.secondary}>{subhead}</div> : null}
          {title !== undefined ? (
            <div className={styles.title}>{title}</div>
          ) : null}
          {subtitle !== undefined ? (
            <div className={styles.secondary}>{subtitle}</div>
          ) : null}
        </div>
      ) : null}

      {after !== undefined ? (
        <span className={`${styles.accessory} ${styles.after}`}>{after}</span>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      {...props}
      className={classes}
      data-appearance={appearance}
      data-stretched={stretched}
      data-with-border={withBorder || undefined}
      ref={ref}
    >
      {media !== undefined ? <div className={styles.media}>{media}</div> : null}
      {header}
      {children}
    </div>
  );
});
