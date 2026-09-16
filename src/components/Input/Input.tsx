import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import {
  FieldControl,
  FieldControlInput,
  type FieldControlStatus,
} from '../FieldControl/FieldControl';

export type InputStatus = FieldControlStatus;

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  /** Optional content rendered before the input. */
  before?: ReactNode;
  /** Optional content rendered after the input. */
  after?: ReactNode;
  status?: InputStatus;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    after,
    before,
    className,
    disabled = false,
    readOnly = false,
    status = 'default',
    type = 'text',
    ...props
  },
  ref,
) {
  const ariaInvalid = status === 'error' ? true : props['aria-invalid'];

  return (
    <FieldControl
      after={after}
      before={before}
      className={className}
      disabled={disabled}
      readOnly={readOnly}
      status={status}
    >
      <FieldControlInput
        {...props}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        readOnly={readOnly}
        ref={ref}
        type={type}
      />
    </FieldControl>
  );
});
