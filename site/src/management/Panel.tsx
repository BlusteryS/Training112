import type { PropsWithChildren } from 'react';
import styles from './Panel.module.css';

export function ManagementPanel({ children }: PropsWithChildren) {
  return <div className={styles.root}>{children}</div>;
}

export function PanelTitle({ children }: PropsWithChildren) {
  return <div className={styles.title}>{children}</div>;
}

export function PanelSubtitle({ children }: PropsWithChildren) {
  return <div className={styles.subtitle}>{children}</div>;
}

export function PanelItemTitle({ children }: PropsWithChildren) {
  return <div className={styles.itemTitle}>{children}</div>;
}

export function PanelCard({ children }: PropsWithChildren) {
  return <div className={styles.card}>{children}</div>;
}

export function PanelList({ children }: PropsWithChildren) {
  return <div className={styles.list}>{children}</div>;
}

export function PanelListItem({ children }: PropsWithChildren) {
  return <div className={styles.listItem}>{children}</div>;
}
