import { Avatar } from '@training112/components/Avatar';
import { Cell } from '@training112/components/Cell';
import { Icon20Placeholder } from '@training112/icons';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';
import styles from './Showcase.module.css';

const documentation: DocumentationRow[] = [
  {
    name: 'title',
    description: 'Основной текст',
    values: ['ReactNode'],
  },
  {
    name: 'subhead',
    description: 'Текст над заголовком',
    values: ['ReactNode'],
  },
  {
    name: 'subtitle',
    description: 'Дополнительный текст',
    values: ['ReactNode'],
  },
  {
    name: 'before',
    description: 'Содержимое перед текстом',
    values: ['ReactNode'],
  },
  {
    name: 'after',
    description: 'Содержимое после текста',
    values: ['ReactNode'],
  },
  {
    name: 'onClick',
    description: 'Включает нажатие и наведение',
    values: ['MouseEventHandler'],
  },
];
const codeExample = `
<Cell
  after={<Icon20Placeholder />}
  subhead="Subhead"
  subtitle="Subtitle"
  title="Title"
/>
`;

export default function CellShowcase() {
  return (
    <ComponentShowcase code={codeExample} documentation={documentation} name="Cell">
      <div className={styles.cellCanvas}>
        <Cell
          after={<Icon20Placeholder />}
          before={<Avatar initials="С" name="Сергей" size={24} variant="color" />}
          onClick={() => undefined}
          subhead="Subhead"
          subtitle="Subtitle"
          title="Title"
        />
      </div>
    </ComponentShowcase>
  );
}
