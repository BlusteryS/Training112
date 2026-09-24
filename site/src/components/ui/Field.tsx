import type { ReactNode } from 'react';
import styles from './controls.module.css';

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? `${styles.field} ${styles.wide}` : styles.field}>
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
  return <Field label={label} wide={wide}>
    <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  </Field>;
}
