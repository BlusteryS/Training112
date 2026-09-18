import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { classNames } from '../utils/classNames';
import styles from './Button.module.css';

export type ButtonAppearance = 'accent' | 'negative' | 'positive' | 'inversion';
export type ButtonMode = 'fill' | 'outline';
export type ButtonSize = 'medium' | 'large';
export type ButtonState = 'default' | 'pressed';

type ButtonBaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  children: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  size?: ButtonSize;
  state?: ButtonState;
};

type StandardButtonProps = ButtonBaseProps & {
  appearance?: Exclude<ButtonAppearance, 'inversion'>;
  mode?: ButtonMode;
};

type InversionButtonProps = ButtonBaseProps & {
  appearance: 'inversion';
  mode?: 'fill';
};

export type ButtonProps = StandardButtonProps | InversionButtonProps;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    appearance = 'accent',
    after,
    before,
    children,
    className,
    disabled = false,
    mode = 'fill',
    size = 'medium',
    state = 'default',
    type = 'button',
    ...props
  },
  ref,
) {
  const classes = classNames(styles.button, className);
  const renderIcon = (icon: ReactNode) => (
    <span aria-hidden="true" className={styles.icon}>
      {icon}
    </span>
  );

  return (
    <button
      {...props}
      className={classes}
      data-appearance={appearance}
      data-mode={mode}
      data-size={size}
      data-state={state}
      disabled={disabled}
      ref={ref}
      type={type}
    >
      {before != null ? renderIcon(before) : null}
      <span className={styles.label}>{children}</span>
      {after != null ? renderIcon(after) : null}
    </button>
  );
});
