import type { ReactNode } from 'react';
import styles from './controls.module.css';

export function Field({ label, children, wide, tone = 'compact' }: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  tone?: 'compact' | 'search';
}) {
  const field = tone === 'search' ? styles.search : styles.field;
  return <label className={wide ? `${field} ${styles.wide}` : field}>
    <span>{label}</span>
    {children}
  </label>;
}

export function TextField({ label, value, onChange, placeholder, wide }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  return <Field label={label} wide={wide} tone="search">
    <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  </Field>;
}
