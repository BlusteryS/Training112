import type { ReactNode } from 'react';
import styles from './SummaryGrid.module.css';

export function SummaryGrid({ items }: { items: { label: string; value: ReactNode }[] }) {
  return <div className={styles.grid}>
    {items.map(({ label, value }) => <div className={styles.item} key={label}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
    </div>)}
  </div>;
}
