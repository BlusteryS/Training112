import type { CSSProperties, ReactNode } from 'react';
import styles from './Desk.module.css';

export function Desk({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return <div className={styles.board}>
    <div className={styles.toolbar}>
      <div className={styles.title}>{title}</div>
      {actions && <div className={styles.controls}>{actions}</div>}
    </div>
    {children}
  </div>;
}

export function DeskTable({ columns, head, children }: { columns: string; head: ReactNode; children: ReactNode }) {
  const style = { '--cols': columns } as CSSProperties;
  return <div className={styles.table}>
    <div className={styles.head} style={style}>{head}</div>
    {children}
  </div>;
}

export function DeskRow({ columns, children }: { columns: string; children: ReactNode }) {
  return <div className={styles.row} style={{ '--cols': columns } as CSSProperties}>{children}</div>;
}

export function DeskEmpty({ children }: { children: string }) {
  return <div className={styles.empty}>{children}</div>;
}

export const deskActions = styles.actions;
export const deskError = styles.error;
