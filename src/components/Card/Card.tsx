import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import styles from './Card.module.css';

export type CardAppearance =
  | 'default'
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
  subtitle?: ReactNode;
  title?: ReactNode;
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    after,
    appearance = 'default',
    before,
    children,
    className,
    subtitle,
    title,
    ...props
  },
  ref,
) {
  const classes = [styles.card, className].filter(Boolean).join(' ');
  const hasHeader =
    after !== undefined ||
    before !== undefined ||
    subtitle !== undefined ||
    title !== undefined;

  return (
    <div
      {...props}
      className={classes}
      data-appearance={appearance}
      ref={ref}
    >
      {hasHeader ? (
        <div className={styles.header}>
          {before !== undefined ? (
            <span className={styles.accessory}>
              {before}
            </span>
          ) : null}

          {title !== undefined || subtitle !== undefined ? (
            <div className={styles.heading}>
              {title !== undefined ? (
                <div className={styles.title}>{title}</div>
              ) : null}
              {subtitle !== undefined ? (
                <div className={styles.subtitle}>{subtitle}</div>
              ) : null}
            </div>
          ) : null}

          {after !== undefined ? (
            <span className={`${styles.accessory} ${styles.after}`}>
              {after}
            </span>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
});
