import type { InputHTMLAttributes } from 'react';
import { FieldLayout, type FieldTone } from './FieldLayout';
import styles from './InputField.module.css';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  wide?: boolean;
  tone?: FieldTone;
};

export function InputField({ label, wide, tone, type, ...props }: Props) {
  const className = type === 'file' ? styles.file : tone === 'search' ? styles.search : styles.input;
  return <FieldLayout label={label} wide={wide} tone={tone}>
    <input {...props} type={type} className={className} />
  </FieldLayout>;
}
