import {
  forwardRef,
  type ForwardedRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { classNames } from '../utils/classNames';
import styles from './FieldControl.module.css';

export type FieldControlStatus = 'default' | 'valid' | 'error';
export type FieldControlIconAppearance = 'dynamic' | 'tertiary';

export type FieldControlProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  after?: ReactNode;
  as?: 'div' | 'label';
  before?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  iconAppearance?: FieldControlIconAppearance;
  readOnly?: boolean;
  status?: FieldControlStatus;
};

export const FieldControl = forwardRef<HTMLElement, FieldControlProps>(function FieldControl(
  {
    after,
    as = 'label',
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
  const classes = classNames(styles.root, className);
  const content = (
    <>
      {before !== undefined ? (
        <span aria-hidden="true" className={styles.icon}>
          {before}
        </span>
      ) : null}

      {children}

      {after !== undefined ? (
        <span className={styles.icon}>
          {after}
        </span>
      ) : null}
    </>
  );
  const rootProps = {
    ...props,
    className: classes,
    'data-disabled': disabled || undefined,
    'data-icon-appearance': iconAppearance,
    'data-read-only': readOnly || undefined,
    'data-status': status,
  };

  if (as === 'div') {
    return (
      <div {...rootProps} ref={ref as ForwardedRef<HTMLDivElement>}>
        {content}
      </div>
    );
  }

  return (
    <label
      {...rootProps}
      ref={ref as ForwardedRef<HTMLLabelElement>}
    >
      {content}
    </label>
  );
});

export const FieldControlInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function FieldControlInput({ className, ...props }, ref) {
  const classes = classNames(styles.input, className);

  return <input {...props} className={classes} ref={ref} />;
});
