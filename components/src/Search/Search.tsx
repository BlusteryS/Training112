import {
  forwardRef,
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
} from 'react';
import { Icon20Search, Icon24Close } from '@training112/icons';
import { classNames } from '../utils/classNames';
import { setRef } from '../utils/setRef';
import {
  FieldControl,
  FieldControlInput,
} from '../FieldControl/FieldControl';
import { IconButton } from '../IconButton';
import styles from './Search.module.css';

export type SearchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> & {
  clearLabel?: string;
  withClearButton?: boolean;
};

function clearInput(input: HTMLInputElement) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;

  if (valueSetter) {
    valueSetter.call(input, '');
  } else {
    input.value = '';
  }

  input.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

export const Search = forwardRef<HTMLInputElement, SearchProps>(function Search(
  {
    className,
    clearLabel = 'Очистить поиск',
    defaultValue,
    disabled = false,
    onChange,
    readOnly = false,
    value,
    withClearButton = false,
    ...props
  },
  forwardedRef,
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? '');
  const currentValue = value ?? uncontrolledValue;
  const hasValue = String(currentValue).length > 0;
  const setInputRef = useCallback(
    (element: HTMLInputElement | null) => {
      inputRef.current = element;
      setRef(forwardedRef, element);
    },
    [forwardedRef],
  );
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (value === undefined) {
        setUncontrolledValue(event.currentTarget.value);
      }

      onChange?.(event);
    },
    [onChange, value],
  );

  return (
    <FieldControl
      after={
        withClearButton && hasValue ? (
          <IconButton
            appearance="tertiary"
            aria-label={clearLabel}
            disabled={disabled || readOnly}
            onClick={() => {
              if (inputRef.current !== null) {
                clearInput(inputRef.current);
                inputRef.current.focus();
              }
            }}
            size="small"
          >
            <Icon24Close />
          </IconButton>
        ) : undefined
      }
      before={<Icon20Search />}
      className={classNames(styles.root, className)}
      disabled={disabled}
      iconAppearance="tertiary"
      readOnly={readOnly}
    >
      <FieldControlInput
        {...props}
        className={styles.input}
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={handleChange}
        readOnly={readOnly}
        ref={setInputRef}
        type="search"
        value={value}
      />
    </FieldControl>
  );
});
