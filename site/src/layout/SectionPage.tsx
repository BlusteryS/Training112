import type { ReactNode } from 'react';
import styles from './SectionPage.module.css';

type SectionPageProps = {
  title: string;
  actions?: ReactNode;
};

export function SectionPage({ title, actions }: SectionPageProps) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {actions}
      </header>
    </main>
  );
}
