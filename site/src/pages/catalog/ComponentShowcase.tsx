import type { ReactNode } from 'react';
import { Badge } from '@training112/components/Badge';
import { Icon16Github } from '@training112/icons';
import { CodeExample } from './CodeExample';
import { ComponentDocumentation, type DocumentationRow } from './ComponentDocumentation';
import styles from './Showcase.module.css';

const resourceIcon = <Icon16Github />;

type ComponentShowcaseProps = {
  additionalDocumentation?: ReactNode;
  children: ReactNode;
  code: string;
  documentation: DocumentationRow[];
  name: string;
};

export function ComponentShowcase({
  additionalDocumentation,
  children,
  code,
  documentation,
  name,
}: ComponentShowcaseProps) {
  return (
    <article className={styles.showcase}>
      <header className={styles.headerSection}>
        <h1 className={styles.title}>{name}</h1>
        <div className={styles.resources} aria-label="Ресурсы компонента">
          <button aria-label="Открыть GitHub" className={styles.resourceButton} type="button">
            <Badge before={resourceIcon}>
              GitHub
            </Badge>
          </button>
        </div>
      </header>

      <section aria-label={`Варианты компонента ${name}`} className={styles.section}>
        <div className={styles.preview}>{children}</div>
      </section>

      <CodeExample code={code} />
      <ComponentDocumentation componentName={name} rows={documentation} />
      {additionalDocumentation}
    </article>
  );
}
