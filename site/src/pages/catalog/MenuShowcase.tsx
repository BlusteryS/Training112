import { Avatar } from '@training112/components/Avatar';
import { Button } from '@training112/components/Button';
import { Menu } from '@training112/components/Menu';
import { MenuItem } from '@training112/components/MenuItem';
import { Separator } from '@training112/components/Separator';
import { Icon24Close, Icon24Help } from '@training112/icons';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentDocumentation } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';
import styles from './Showcase.module.css';

const menuDocumentation: DocumentationRow[] = [
  {
    name: 'children',
    description: 'Элементы MenuItem',
    values: ['ReactNode'],
  },
  {
    name: 'title',
    description: 'Заголовок меню',
    values: ['ReactNode'],
  },
  {
    name: 'actions',
    description: 'Действия под списком',
    values: ['ReactNode'],
  },
  {
    name: 'trigger',
    description: 'Компонент для открытия',
    values: ['ReactElement'],
  },
  {
    name: 'triggerMode',
    description: 'Способ открытия',
    values: ['click', 'hover', 'manual'],
  },
  {
    name: 'open',
    description: 'Состояние popup',
    values: ['boolean'],
  },
  {
    name: 'placement',
    description: 'Расположение относительно кнопки. По умолчанию bottom-start',
    values: ['top', 'bottom', 'left', 'right', 'С выравниванием -start или -end'],
  },
  {
    name: 'width',
    description: 'Ширина раскрытого меню в пикселях. По умолчанию совпадает с кнопкой; ограничена доступным местом',
    values: ['number'],
  },
  {
    name: 'defaultOpen',
    description: 'Начальное состояние popup',
    values: ['boolean'],
  },
  {
    name: 'onOpenChange',
    description: 'Обработчик открытия',
    values: ['(open: boolean) => void'],
  },
  {
    name: 'selectionMode',
    description: 'Режим выбора. none — действия без выбранного состояния и отметок',
    values: ['single', 'multiple', 'none'],
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
];
const menuItemDocumentation: DocumentationRow[] = [
  {
    name: 'value',
    description: 'Значение пункта для выбора. Не требуется в режиме действий',
    values: ['string'],
  },
  {
    name: 'children',
    description: 'Простой текст пункта',
    values: ['ReactNode'],
  },
  {
    name: 'before',
    description: 'Содержимое перед текстом',
    values: ['ReactNode'],
  },
  {
    name: 'title',
    description: 'Основной текст',
    values: ['ReactNode'],
  },
  {
    name: 'subtitle',
    description: 'Дополнительный текст',
    values: ['ReactNode'],
  },
  {
    name: 'selected',
    description: 'Выбранное состояние',
    values: ['boolean'],
  },
  {
    name: 'disabled',
    description: 'Отключённое состояние',
    values: ['boolean'],
  },
  {
    name: 'onClick',
    description: 'Действие пункта, вызывается также клавишами Enter и пробел',
    values: ['MouseEventHandler'],
  },
];
const codeExample = `
<Menu
  actions={<Button appearance="inversion">Action</Button>}
  defaultValue={['first']}
  selectionMode="multiple"
  title="Title"
>
  <MenuItem value="first">Первый пункт</MenuItem>
  <MenuItem
    subtitle="Subtitle"
    title="Второй пункт"
    value="second"
  />
</Menu>
`;

export default function MenuShowcase() {
  return (
    <ComponentShowcase
      additionalDocumentation={
        <ComponentDocumentation componentName="MenuItem" rows={menuItemDocumentation} />
      }
      code={codeExample}
      documentation={menuDocumentation}
      name="Menu"
    >
      <div className={styles.menuShowcase}>
        <Menu
          aria-label="Пример меню действий"
          placement="right-end"
          selectionMode="none"
          trigger={<Button>Меню действий</Button>}
          width={304}
        >
          <MenuItem before={<Icon24Help />}>Помощь</MenuItem>
          <Separator paddingVertical />
          <MenuItem before={<Icon24Close />}>Выйти из системы</MenuItem>
        </Menu>

        <Menu
          actions={
            <Button appearance="inversion" style={{ width: '100%' }}>
              Button
            </Button>
          }
          defaultValue="second"
          title="Один вариант"
        >
          <MenuItem value="first">Первый пункт</MenuItem>
          <MenuItem value="second">Второй пункт</MenuItem>
          <MenuItem value="third">Третий пункт</MenuItem>
        </Menu>

        <Menu
          actions={
            <Button appearance="inversion" style={{ width: '100%' }}>
              Button
            </Button>
          }
          defaultValue={['call']}
          selectionMode="multiple"
          title="Несколько вариантов"
        >
          <MenuItem
            before={<Avatar name="С" size={24} variant="color" />}
            subtitle="+7 (995) 690 09-09"
            title="Активный звонок"
            value="call"
          />
          <MenuItem
            before={<Avatar name="С" shape="square" size={24} variant="color" />}
            subtitle="+7 (995) 690 09-09"
            title="Активный звонок"
            value="second-call"
          />
        </Menu>
      </div>
    </ComponentShowcase>
  );
}
