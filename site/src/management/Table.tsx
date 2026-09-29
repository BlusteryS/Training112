import { Children, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import styles from './Table.module.css';

type TableStyle = CSSProperties & { '--table-columns': string };

export function TableGrid({ head, children, fillColumn = 0, compact = false,
  className = '', viewportClassName = '', headClassName = '', plainHead = false }: {
  head: ReactElement<{ children: ReactNode }>;
  children: ReactNode;
  fillColumn?: number;
  compact?: boolean;
  className?: string;
  viewportClassName?: string;
  headClassName?: string;
  plainHead?: boolean;
}) {
  const columns = Children.count(head.props.children);
  const tracks = Array.from({ length: columns }, (_, index) =>
    index === fillColumn ? 'minmax(max-content, 1fr)' : 'max-content');
  const style: TableStyle = { '--table-columns': tracks.join(' ') };
  return <div className={`${styles.viewport} ${viewportClassName}`}>
    <div className={`${styles.table} ${compact ? styles.compact : ''} ${className}`} style={style}>
      <div className={`${styles.gridHead} ${plainHead ? '' : styles.head} ${headClassName}`}>{head}</div>
      {children}
    </div>
  </div>;
}

export function TableRow({ children, className = '', plain = false }: {
  children: ReactNode; className?: string; plain?: boolean;
}) {
  return <div className={`${styles.gridRow} ${plain ? '' : styles.row} ${className}`}>{children}</div>;
}

export function DeskTable({ head, children }: {
  head: ReactElement<{ children: ReactNode }>; children: ReactNode;
}) {
  return <TableGrid head={head}>{children}</TableGrid>;
}

export function DeskRow({ children }: { children: ReactNode }) {
  return <TableRow>{children}</TableRow>;
}

export const deskActions = styles.actions;
export const deskInlineActions = styles.inlineActions;
