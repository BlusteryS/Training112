import {
  forwardRef,
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Icon24Close } from '@training112/icons';
import { IconButton } from '../IconButton';
import { clearInput } from '../utils/clearInput';
import { setRef } from '../utils/setRef';
import {
  FieldControl,
  FieldControlInput,
  type FieldControlStatus,
} from '../FieldControl/FieldControl';

export type InputStatus = FieldControlStatus;

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  before?: ReactNode;
  after?: ReactNode;
  status?: InputStatus;
  clearLabel?: string;
  withClearButton?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    after,
    before,
    className,
    clearLabel = 'Очистить поле',
    defaultValue,
    disabled = false,
    onChange,
    readOnly = false,
    status = 'default',
    type = 'text',
    value,
    withClearButton = true,
    ...props
  },
  forwardedRef,
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? '');
  const hasValue = String(value ?? uncontrolledValue).length > 0;
  const setInputRef = useCallback((element: HTMLInputElement | null) => {
    inputRef.current = element;
    setRef(forwardedRef, element);
  }, [forwardedRef]);
  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    if (value === undefined) setUncontrolledValue(event.currentTarget.value);
    onChange?.(event);
  }, [onChange, value]);
  const ariaInvalid = status === 'error' ? true : props['aria-invalid'];

  return (
    <FieldControl
      after={withClearButton && hasValue ? (
        <>
          {after}
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
            size="medium"
          >
            <Icon24Close />
          </IconButton>
        </>
      ) : after}
      before={before}
      className={className}
      disabled={disabled}
      readOnly={readOnly}
      status={status}
    >
      <FieldControlInput
        {...props}
        aria-invalid={ariaInvalid}
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={handleChange}
        readOnly={readOnly}
        ref={setInputRef}
        type={type}
        value={value}
      />
    </FieldControl>
  );
});
