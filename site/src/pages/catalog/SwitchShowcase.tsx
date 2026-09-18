import { Avatar } from '@training112/components/Avatar';
import { Cell } from '@training112/components/Cell';
import { Switch } from '@training112/components/Switch';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';
import styles from './Showcase.module.css';

const documentation: DocumentationRow[] = [
  {
    name: 'aria-label',
    description: 'Доступное название',
    values: ['string'],
  },
  {
    name: 'checked',
    description: 'Выбранное состояние',
    values: ['boolean'],
  },
  {
    name: 'defaultChecked',
    description: 'Начальное состояние',
    values: ['boolean'],
  },
  {
    name: 'disabled',
    description: 'Отключённое состояние',
    values: ['boolean'],
  },
  {
    name: 'onChange',
    description: 'Обработчик изменения',
    values: ['ChangeEventHandler'],
  },
];
const codeExample = `
<Switch aria-label="Уведомления" />
`;
const avatar = <Avatar initials="С" name="Сергей" size={24} variant="color" />;

export default function SwitchShowcase() {
  return (
    <ComponentShowcase code={codeExample} documentation={documentation} name="Switch">
      <div className={styles.switchCanvas}>
        <Cell
          after={<Switch aria-label="Включить настройку" />}
          before={avatar}
          subtitle="Subtitle"
          title="Title"
        />
      </div>
    </ComponentShowcase>
  );
}
