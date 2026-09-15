import type { CodeTokenKind } from './codeTokenizer';
import { tokenizeCode } from './codeTokenizer';
import styles from './Showcase.module.css';

type CodeExampleProps = {
  code: string;
};

const classNameByTokenKind: Partial<Record<CodeTokenKind, string>> = {
  attribute: styles.codeAttribute,
  comment: styles.codeComment,
  function: styles.codeFunction,
  keyword: styles.codeKeyword,
  number: styles.codeNumber,
  punctuation: styles.codePunctuation,
  string: styles.codeString,
  tag: styles.codeTag,
};

export function CodeExample({ code }: CodeExampleProps) {
  const tokens = tokenizeCode(code.trim());

  return (
    <section aria-label="Пример кода" className={styles.section}>
      <div className={styles.codeCard}>
        <span className={styles.codeLabel}>Код</span>
        <pre className={styles.codeBlock}>
          <code>
            {tokens.map(({ kind, value }, index) => {
              const className = classNameByTokenKind[kind];

              return className ? (
                <span className={className} key={`${index}-${kind}`}>
                  {value}
                </span>
              ) : (
                value
              );
            })}
          </code>
        </pre>
      </div>
    </section>
  );
}
