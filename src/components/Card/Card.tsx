import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { classNames } from '../../utils/classNames';
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
  stretched?: boolean;
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
    stretched = true,
    subtitle,
    title,
    ...props
  },
  ref,
) {
  const classes = classNames(styles.card, className);
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
      data-stretched={stretched}
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
