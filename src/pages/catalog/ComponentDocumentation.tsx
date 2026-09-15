import { Badge } from '../../components/Badge';
import styles from './Showcase.module.css';

export type DocumentationRow = {
  description: string;
  name: string;
  values: readonly string[];
};

type ComponentDocumentationProps = {
  componentName: string;
  rows: DocumentationRow[];
};

export function ComponentDocumentation({ componentName, rows }: ComponentDocumentationProps) {
  return (
    <section className={styles.section} aria-label={`Свойства компонента ${componentName}`}>
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <caption className={styles.visuallyHidden}>Свойства компонента {componentName}</caption>
          <colgroup>
            <col className={styles.propertyColumn} />
            <col className={styles.descriptionColumn} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{componentName}</th>
              <th scope="col">Описание</th>
              <th scope="col">Возможные значения</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ description, name, values }) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td>{description}</td>
                <td>
                  <div className={styles.valueList}>
                    {values.map((value) => (
                      <Badge key={value}>{value}</Badge>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
