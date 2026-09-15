import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Badge.module.css';

export const badgeColors = ['white', 'blue', 'inverted', 'success', 'error', 'warning'] as const;

export type BadgeColor = (typeof badgeColors)[number];
export type BadgeVariant = 'fill' | 'outline';

type BadgeBaseProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'color'> & {
  children: ReactNode;
  /** Optional content rendered before the label. */
  before?: ReactNode;
};

type FillBadgeProps = BadgeBaseProps & {
  variant?: 'fill';
  color?: BadgeColor;
};

type OutlineBadgeProps = BadgeBaseProps & {
  variant: 'outline';
  color: Exclude<BadgeColor, 'white'>;
};

export type BadgeProps = FillBadgeProps | OutlineBadgeProps;

export function Badge({
  before,
  children,
  className,
  color = 'white',
  variant = 'fill',
  ...props
}: BadgeProps) {
  const classes = [styles.badge, className].filter(Boolean).join(' ');

  return (
    <span
      {...props}
      className={classes}
      data-color={color}
      data-variant={variant}
    >
      {before ? (
        <span aria-hidden="true" className={styles.icon}>
          {before}
        </span>
      ) : null}
      <span className={styles.label}>{children}</span>
    </span>
  );
}
