import { forwardRef, type InputHTMLAttributes } from 'react';
import { classNames } from '../../utils/classNames';
import styles from './Switch.module.css';

export type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'>;

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { className, disabled = false, ...props },
  ref,
) {
  return (
    <label className={classNames(styles.root, className)} data-disabled={disabled || undefined}>
      <input
        {...props}
        className={styles.input}
        disabled={disabled}
        ref={ref}
        role="switch"
        type="checkbox"
      />
      <span aria-hidden="true" className={styles.track}>
        <span className={styles.thumb} />
      </span>
    </label>
  );
});
