import { Fragment } from 'react';
import styles from './Showcase.module.css';

type CodeExampleProps = {
  code: string;
};

const attributePattern = /([A-Za-z][\w-]*)(?=\s*=)/gu;

function highlightAttributes(line: string) {
  const parts = line.split(attributePattern);

  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <span className={styles.codeAttribute} key={`${part}-${index}`}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function CodeExample({ code }: CodeExampleProps) {
  const lines = code.trim().split('\n');

  return (
    <section aria-label="Пример кода" className={styles.section}>
      <div className={styles.codeCard}>
        <span className={styles.codeLabel}>Код</span>
        <pre className={styles.codeBlock}>
          <code>
            {lines.map((line, index) => (
              <Fragment key={`${line}-${index}`}>
                {highlightAttributes(line)}
                {index < lines.length - 1 ? '\n' : null}
              </Fragment>
            ))}
          </code>
        </pre>
      </div>
    </section>
  );
}
