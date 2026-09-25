import type { ReactNode } from 'react';
import styles from './FieldLayout.module.css';

export type FieldTone = 'compact' | 'search';

export function FieldLayout({ label, children, wide, tone = 'compact' }: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  tone?: FieldTone;
}) {
  const className = tone === 'search' ? styles.search : styles.field;
  return <label className={wide ? `${className} ${styles.wide}` : className}>
    <span>{label}</span>
    {children}
  </label>;
}
