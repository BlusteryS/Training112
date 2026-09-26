import type { CSSProperties, ReactNode } from 'react';
import styles from './Table.module.css';

type TableStyle = CSSProperties & { '--cols': string; '--table-min-width'?: string };

export function DeskTable({ columns, head, children, minWidth }: {
  columns: string; head: ReactNode; children: ReactNode; minWidth?: number;
}) {
  const style: TableStyle = { '--cols': columns };
  if (minWidth) style['--table-min-width'] = `${minWidth}px`;
  return <div className={styles.table} style={style}>
    <div className={styles.head}>{head}</div>
    {children}
  </div>;
}

export function DeskRow({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}

export const deskActions = styles.actions;
