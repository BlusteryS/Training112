import { Progress } from '../../components/Progress';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';
import styles from './Showcase.module.css';

const documentation: DocumentationRow[] = [
  {
    name: 'value',
    description: 'Текущее значение',
    values: ['number'],
  },
  {
    name: 'max',
    description: 'Максимальное значение',
    values: ['number', '100'],
  },
];
const codeExample = `
<Progress aria-label="Загрузка" value={22} />
`;

export default function ProgressShowcase() {
  return (
    <ComponentShowcase code={codeExample} documentation={documentation} name="Progress">
      <div className={styles.progressCanvas}>
        <Progress aria-label="Загрузка" value={22} />
      </div>
    </ComponentShowcase>
  );
}
