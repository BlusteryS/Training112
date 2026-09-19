import { Input } from '@training112/components/Input';
import { Icon20Placeholder } from '@training112/icons';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';
import styles from './Showcase.module.css';

const demoIcon = <Icon20Placeholder height={16} width={16} />;
const documentation: DocumentationRow[] = [
  {
    name: 'placeholder',
    description: 'Текст пустого поля',
    values: ['string'],
  },
  {
    name: 'value',
    description: 'Значение поля',
    values: ['string'],
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
  {
    name: 'before',
    description: 'Содержимое перед полем',
    values: ['ReactNode'],
  },
  {
    name: 'after',
    description: 'Содержимое после поля',
    values: ['ReactNode'],
  },
  {
    name: 'withClearButton',
    description: 'Кнопка очистки непустого поля, включена по умолчанию',
    values: ['boolean'],
  },
  {
    name: 'clearLabel',
    description: 'Доступное название кнопки очистки',
    values: ['string'],
  },
  {
    name: 'onChange',
    description: 'Обработчик изменения',
    values: ['ChangeEventHandler'],
  },
];
const codeExample = `
<Input placeholder="Text" />
`;

export default function InputShowcase() {
  return (
    <ComponentShowcase code={codeExample} documentation={documentation} name="Input">
      <div className={styles.inputList}>
        <Input after={demoIcon} before={demoIcon} placeholder="Text" />
        <Input after={demoIcon} before={demoIcon} defaultValue="Text" />
        <Input
          after={demoIcon}
          before={demoIcon}
          defaultValue="Text"
          status="valid"
        />
        <Input
          after={demoIcon}
          before={demoIcon}
          defaultValue="Text"
          status="error"
        />
        <Input before={demoIcon} defaultValue="Text" disabled />
      </div>
    </ComponentShowcase>
  );
}
