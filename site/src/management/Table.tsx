import { Children, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import styles from './Table.module.css';

type TableStyle = CSSProperties & { '--table-columns': string };

export function TableGrid({ head, children, fillColumn = -1, actionsRight = false, compact = false,
  className = '', viewportClassName = '', headClassName = '', plainHead = false }: {
  head: ReactElement<{ children: ReactNode }>;
  children: ReactNode;
  fillColumn?: number;
  actionsRight?: boolean;
  compact?: boolean;
  className?: string;
  viewportClassName?: string;
  headClassName?: string;
  plainHead?: boolean;
}) {
  const columns = Children.count(head.props.children);
  const tracks = actionsRight
    ? [...Array.from({ length: columns - 1 }, () => 'minmax(max-content, 1fr)'), 'max-content']
    : Array.from({ length: columns }, (_, index) =>
      fillColumn < 0 || index === fillColumn ? 'minmax(max-content, 1fr)' : 'max-content');
  const style: TableStyle = { '--table-columns': tracks.join(' ') };
  return <div className={`${styles.viewport} ${viewportClassName}`}>
    <div className={`${styles.table} ${actionsRight ? styles.actionsRight : ''} ${compact ? styles.compact : ''} ${className}`} style={style}>
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

export function DeskTable({ head, children, actionsRight = false }: {
  head: ReactElement<{ children: ReactNode }>; children: ReactNode; actionsRight?: boolean;
}) {
  return <TableGrid head={head} actionsRight={actionsRight}>{children}</TableGrid>;
}

export function DeskRow({ children }: { children: ReactNode }) {
  return <TableRow>{children}</TableRow>;
}

export const deskActions = styles.actions;
export const deskActionHead = styles.actionHead;
export const deskInlineActions = styles.inlineActions;
export const deskPlaceholder = styles.placeholder;
