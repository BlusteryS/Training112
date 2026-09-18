import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Icon20Check, Icon20Minus } from '@training112/icons';
import { classNames } from '../utils/classNames';
import { setRef } from '../utils/setRef';
import styles from './Checkbox.module.css';

export type CheckboxVariant = 'checkbox' | 'radio';

export type CheckboxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'children' | 'size' | 'type'
> & {
  children?: ReactNode;
  indeterminate?: boolean;
  padding?: boolean;
  subtitle?: ReactNode;
  variant?: CheckboxVariant;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    checked,
    children,
    className,
    disabled = false,
    indeterminate = false,
    padding,
    subtitle,
    variant = 'checkbox',
    ...props
  },
  forwardedRef,
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setInputRef = useCallback(
    (input: HTMLInputElement | null) => {
      inputRef.current = input;
      setRef(forwardedRef, input);
    },
    [forwardedRef],
  );

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const classes = classNames(styles.root, className);
  const hasText = children !== undefined || subtitle !== undefined;
  const hasPadding = padding ?? hasText;

  return (
    <label
      className={classes}
      data-disabled={disabled || undefined}
      data-has-text={hasText || undefined}
      data-indeterminate={indeterminate || undefined}
      data-padding={hasPadding}
      data-variant={variant}
    >
      <span className={styles.control}>
        <input
          {...props}
          aria-checked={variant === 'checkbox' && indeterminate ? 'mixed' : undefined}
          checked={checked}
          className={styles.input}
          disabled={disabled}
          ref={setInputRef}
          type={variant}
        />
        <span aria-hidden="true" className={styles.visual}>
          <Icon20Check className={styles.checkmark} />
          <Icon20Minus className={styles.mixedMark} />
        </span>
      </span>

      {hasText ? (
        <span className={styles.text}>
          {children !== undefined ? <span className={styles.title}>{children}</span> : null}
          {subtitle !== undefined ? <span className={styles.subtitle}>{subtitle}</span> : null}
        </span>
      ) : null}
    </label>
  );
});
