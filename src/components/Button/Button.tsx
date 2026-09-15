import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonAppearance = 'accent' | 'negative' | 'positive' | 'inversion';
export type ButtonMode = 'fill' | 'outline';
export type ButtonSize = 'medium' | 'large';
export type ButtonState = 'default' | 'pressed';

type ButtonBaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  children: ReactNode;
  /** Optional content rendered before the label. */
  before?: ReactNode;
  /** Optional content rendered after the label. */
  after?: ReactNode;
  size?: ButtonSize;
  /** Allows the pressed style to be displayed in static component previews. */
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

export function Button({
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
}: ButtonProps) {
  const classes = [styles.button, className].filter(Boolean).join(' ');
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
      type={type}
    >
      {before ? renderIcon(before) : null}
      <span className={styles.label}>{children}</span>
      {after ? renderIcon(after) : null}
    </button>
  );
}
