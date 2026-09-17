import {
  forwardRef,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
} from 'react';
import styles from './FieldControl.module.css';

export type FieldControlStatus = 'default' | 'valid' | 'error';
export type FieldControlIconAppearance = 'dynamic' | 'tertiary';

export type FieldControlProps = Omit<LabelHTMLAttributes<HTMLLabelElement>, 'children'> & {
  after?: ReactNode;
  before?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  iconAppearance?: FieldControlIconAppearance;
  readOnly?: boolean;
  status?: FieldControlStatus;
};

export const FieldControl = forwardRef<HTMLLabelElement, FieldControlProps>(function FieldControl(
  {
    after,
    before,
    children,
    className,
    disabled = false,
    iconAppearance = 'dynamic',
    readOnly = false,
    status = 'default',
    ...props
  },
  ref,
) {
  const classes = [styles.root, className].filter(Boolean).join(' ');

  return (
    <label
      {...props}
      className={classes}
      data-disabled={disabled || undefined}
      data-icon-appearance={iconAppearance}
      data-read-only={readOnly || undefined}
      data-status={status}
      ref={ref}
    >
      {before !== undefined ? (
        <span aria-hidden="true" className={styles.icon}>
          {before}
        </span>
      ) : null}

      {children}

      {after !== undefined ? (
        <span aria-hidden="true" className={styles.icon}>
          {after}
        </span>
      ) : null}
    </label>
  );
});

export const FieldControlInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function FieldControlInput({ className, ...props }, ref) {
  const classes = [styles.input, className].filter(Boolean).join(' ');

  return <input {...props} className={classes} ref={ref} />;
});
