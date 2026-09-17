import { Search } from '../../components/Search';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';
import styles from './Showcase.module.css';

const documentation: DocumentationRow[] = [
  {
    name: 'placeholder',
    description: 'Текст пустого поля',
    values: ['string'],
  },
  {
    name: 'value',
    description: 'Поисковый запрос',
    values: ['string'],
  },
  {
    name: 'withClearButton',
    description: 'Показывает кнопку очистки',
    values: ['boolean'],
  },
  {
    name: 'onChange',
    description: 'Обработчик запроса',
    values: ['ChangeEventHandler'],
  },
  {
    name: 'disabled',
    description: 'Отключённое состояние',
    values: ['boolean'],
  },
];
const codeExample = `
<Search placeholder="Поиск" />
`;

export default function SearchShowcase() {
  return (
    <ComponentShowcase code={codeExample} documentation={documentation} name="Search">
      <div className={styles.searchCanvas}>
        <Search
          placeholder="Поиск"
          withClearButton
        />
      </div>
    </ComponentShowcase>
  );
}
