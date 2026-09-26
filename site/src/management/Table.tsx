import { Children, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import styles from './Table.module.css';

type TableStyle = CSSProperties & { '--column-count': number };

export function DeskTable({ head, children }: {
  head: ReactElement<{ children: ReactNode }>; children: ReactNode;
}) {
  const style: TableStyle = { '--column-count': Children.count(head.props.children) };
  return <div className={styles.viewport}>
    <div className={styles.table} style={style}>
      <div className={styles.head}>{head}</div>
      {children}
    </div>
  </div>;
}

export function DeskRow({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}

export const deskActions = styles.actions;
