import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type InputHTMLAttributes,
} from 'react';
import styles from './Checkbox.module.css';

export type CheckboxVariant = 'checkbox' | 'radio';

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> & {
  /** Displays the mixed state and sets the native indeterminate property. */
  indeterminate?: boolean;
  variant?: CheckboxVariant;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    checked,
    className,
    disabled = false,
    indeterminate = false,
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

  return (
    <span className={classes} data-indeterminate={indeterminate || undefined} data-variant={variant}>
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
        <svg className={styles.checkmark} fill="none" height="20" viewBox="0 0 20 20" width="20">
          <path
            d="M6 10L9.42857 13L14 7"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
        <svg className={styles.mixedMark} fill="none" height="20" viewBox="0 0 20 20" width="20">
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
  );
});
