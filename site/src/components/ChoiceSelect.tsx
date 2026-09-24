import type { ReactNode, ChangeEvent } from 'react';
import styles from './ChoiceSelect.module.css';

export function ChoiceSelect({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return <label className={styles.control}>
    <span className={styles.hidden}>{label}</span>
    <select value={value} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}>
      {children}
    </select>
  </label>;
}
