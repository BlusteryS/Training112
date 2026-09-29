import type { ReactNode } from 'react';
import styles from './Desk.module.css';

export function Desk({ title, actions, children }: { title?: string; actions?: ReactNode; children?: ReactNode }) {
  return <div className={styles.board}>
    <div className={styles.toolbar}>
      {title && <div className={styles.title}>{title}</div>}
      {actions && <div className={styles.controls}>{actions}</div>}
    </div>
    <div className={styles.content}>{children}</div>
  </div>;
}

export function DeskSection({ title, children }: { title: string; children: ReactNode }) {
  return <div className={styles.section}>
    <div className={styles.sectionTitle}>{title}</div>
    {children}
  </div>;
}

export { DeskTable, DeskRow } from './Table';

export function DeskEmpty({ children }: { children: string }) {
  return <div className={styles.empty}>{children}</div>;
}

export const deskError = styles.error;
export { deskActionHead, deskActions, deskInlineActions, deskPlaceholder } from './Table';
