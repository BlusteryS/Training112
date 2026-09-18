import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { classNames } from '../../utils/classNames';
import styles from './Placeholder.module.css';

export type PlaceholderProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  icon?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

export const Placeholder = forwardRef<HTMLDivElement, PlaceholderProps>(function Placeholder(
  { actions, className, icon, subtitle, title, ...props },
  ref,
) {
  const classes = classNames(styles.placeholder, className);
  const hasText = title !== undefined || subtitle !== undefined;
  const hasContent = hasText || actions !== undefined;

  return (
    <div {...props} className={classes} ref={ref}>
      {icon !== undefined ? <div className={styles.icon}>{icon}</div> : null}

      {hasContent ? (
        <div className={styles.content}>
          {hasText ? (
            <div className={styles.text}>
              {title !== undefined ? <div className={styles.title}>{title}</div> : null}
              {subtitle !== undefined ? <div className={styles.subtitle}>{subtitle}</div> : null}
            </div>
          ) : null}

          {actions !== undefined ? <div className={styles.actions}>{actions}</div> : null}
        </div>
      ) : null}
    </div>
  );
});
