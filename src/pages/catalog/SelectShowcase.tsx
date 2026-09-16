import { Select } from '../../components/Select';
import { MenuItem } from '../../components/MenuItem';
import { Icon20Placeholder } from '../../icons';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';
import styles from './Showcase.module.css';

const selectDocumentation: DocumentationRow[] = [
  {
    name: 'children',
    description: 'Варианты выбора',
    values: ['MenuItem', 'MenuItem[]'],
  },
  {
    name: 'placeholder',
    description: 'Текст пустого поля',
    values: ['string'],
  },
  {
    name: 'searchable',
    description: 'Включает поиск',
    values: ['boolean'],
  },
  {
    name: 'selectionMode',
    description: 'Режим выбора',
    values: ['single', 'multiple'],
  },
  {
    name: 'value',
    description: 'Выбранные значения',
    values: ['string', 'readonly string[]'],
  },
  {
    name: 'defaultValue',
    description: 'Начальный выбор',
    values: ['string', 'readonly string[]'],
  },
  {
    name: 'onValueChange',
    description: 'Обработчик выбора',
    values: ['(value: string) => void', '(value: string[]) => void'],
  },
  {
    name: 'searchValue',
    description: 'Поисковый запрос',
    values: ['string'],
  },
  {
    name: 'onSearchValueChange',
    description: 'Обработчик поиска',
    values: ['(value: string) => void'],
  },
  {
    name: 'menuLabel',
    description: 'Название меню',
    values: ['string'],
  },
  {
    name: 'before',
    description: 'Содержимое перед полем',
    values: ['ReactNode'],
  },
  {
    name: 'status',
    description: 'Статус значения',
    values: ['default', 'valid', 'error'],
  },
  {
    name: 'disabled',
    description: 'Отключённое состояние',
    values: ['boolean'],
  },
];
const codeExample = `
<Select placeholder="Text" searchable>
  <MenuItem value="title">Title</MenuItem>
</Select>
`;

export default function SelectShowcase() {
  return (
    <ComponentShowcase
      code={codeExample}
      documentation={selectDocumentation}
      name="Select"
    >
      <div className={styles.selectCanvas}>
        <Select
          before={<Icon20Placeholder />}
          placeholder="Text"
          searchable
        >
          <MenuItem value="title">Title</MenuItem>
        </Select>
      </div>
    </ComponentShowcase>
  );
}
