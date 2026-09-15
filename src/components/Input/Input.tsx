import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import styles from './Input.module.css';

export type InputStatus = 'default' | 'valid' | 'error';

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  /** Optional content rendered before the input. */
  before?: ReactNode;
  /** Optional content rendered after the input. */
  after?: ReactNode;
  status?: InputStatus;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    after,
    before,
    className,
    disabled = false,
    status = 'default',
    type = 'text',
    ...props
  },
  ref,
) {
  const classes = [styles.root, className].filter(Boolean).join(' ');
  const ariaInvalid = status === 'error' ? true : props['aria-invalid'];

  return (
    <label
      className={classes}
      data-disabled={disabled || undefined}
      data-status={status}
    >
      {before ? (
        <span aria-hidden="true" className={styles.icon}>
          {before}
        </span>
      ) : null}

      <input
        {...props}
        aria-invalid={ariaInvalid}
        className={styles.input}
        disabled={disabled}
        ref={ref}
        type={type}
      />

      {after ? (
        <span aria-hidden="true" className={styles.icon}>
          {after}
        </span>
      ) : null}
    </label>
  );
});
