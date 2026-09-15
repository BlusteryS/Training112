import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import styles from './Checkbox.module.css';

export type CheckboxVariant = 'checkbox' | 'radio';

export type CheckboxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'children' | 'size' | 'type'
> & {
  children?: ReactNode;
  /** Displays the mixed state and sets the native indeterminate property. */
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

      if (typeof forwardedRef === 'function') {
        forwardedRef(input);
      } else if (forwardedRef) {
        forwardedRef.current = input;
      }
    },
    [forwardedRef],
  );

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const classes = [styles.root, className].filter(Boolean).join(' ');
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
          <svg
            className={styles.checkmark}
            fill="none"
            height="20"
            viewBox="0 0 20 20"
            width="20"
          >
            <path
              d="M6 10L9.42857 13L14 7"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
          <svg
            className={styles.mixedMark}
            fill="none"
            height="20"
            viewBox="0 0 20 20"
            width="20"
          >
            <path
              d="M6 10H14"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
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
