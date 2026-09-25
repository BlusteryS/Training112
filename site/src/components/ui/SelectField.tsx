import type { SelectHTMLAttributes } from 'react';
import { FieldLayout, type FieldTone } from './FieldLayout';
import styles from './SelectField.module.css';

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  wide?: boolean;
  tone?: FieldTone;
};

export function SelectField({ label, wide, tone, children, ...props }: Props) {
  return <FieldLayout label={label} wide={wide} tone={tone}>
    <select {...props} className={tone === 'search' ? styles.search : styles.select}>
      {children}
    </select>
  </FieldLayout>;
}
