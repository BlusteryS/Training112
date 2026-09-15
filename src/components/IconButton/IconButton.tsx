import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './IconButton.module.css';

export type IconButtonAppearance = 'primary' | 'tertiary';
export type IconButtonSize = 'small' | 'medium';

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  appearance?: IconButtonAppearance;
  children: ReactNode;
  size?: IconButtonSize;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    appearance = 'primary',
    children,
    className,
    size = 'medium',
    type = 'button',
    ...props
  },
  ref,
) {
  const classes = [styles.button, className].filter(Boolean).join(' ');

  return (
    <button
      {...props}
      className={classes}
      data-appearance={appearance}
      data-size={size}
      ref={ref}
      type={type}
    >
      {children}
    </button>
  );
});
