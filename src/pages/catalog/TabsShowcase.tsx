import { Tab } from '../../components/Tab';
import { Tabs } from '../../components/Tabs';
import { PlaceholderIcon } from '../../icons/PlaceholderIcon';
import { ComponentDocumentation, type DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';
import styles from './Showcase.module.css';

const tabsDocumentation: DocumentationRow[] = [
  {
    name: 'children',
    description: 'Элементы Tab',
    values: ['ReactNode'],
  },
  {
    name: 'layoutFillMode',
    description: 'Распределение вкладок',
    values: ['auto', 'stretched', 'shrinked'],
  },
  {
    name: 'selectedId',
    description: 'Выбранная вкладка',
    values: ['string'],
  },
  {
    name: 'defaultSelectedId',
    description: 'Начальная вкладка',
    values: ['string'],
  },
  {
    name: 'onSelectedIdChange',
    description: 'Обработчик выбора',
    values: ['(id: string) => void'],
  },
  {
    name: 'withScrollToSelectedTab',
    description: 'Прокрутка к выбранной',
    values: ['boolean'],
  },
  {
    name: 'scrollBehaviorToSelectedTab',
    description: 'Выравнивание прокрутки',
    values: ['start', 'center', 'end', 'nearest'],
  },
];
const tabDocumentation: DocumentationRow[] = [
  {
    name: 'id',
    description: 'Идентификатор вкладки',
    values: ['string'],
  },
  {
    name: 'children',
    description: 'Текст вкладки',
    values: ['ReactNode'],
  },
  {
    name: 'selected',
    description: 'Выбранное состояние',
    values: ['boolean'],
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
    name: 'disabled',
    description: 'Отключённое состояние',
    values: ['boolean'],
  },
];
const codeExample = `
<Tabs defaultSelectedId="first" layoutFillMode="shrinked">
  <Tab id="first">
    Tab
  </Tab>
  <Tab id="second">
    Tab
  </Tab>
  <Tab disabled id="third">
    Tab
  </Tab>
</Tabs>
`;
const demoIcon = <PlaceholderIcon />;

export default function TabsShowcase() {
  return (
    <ComponentShowcase
      additionalDocumentation={
        <ComponentDocumentation componentName="Tab" rows={tabDocumentation} />
      }
      code={codeExample}
      documentation={tabsDocumentation}
      name="Tabs"
    >
      <div className={styles.tabsCanvas}>
        <Tabs defaultSelectedId="first" layoutFillMode="shrinked">
          <Tab before={demoIcon} id="first">
            Tab
          </Tab>
          <Tab before={demoIcon} id="second">
            Tab
          </Tab>
          <Tab before={demoIcon} disabled id="third">
            Tab
          </Tab>
        </Tabs>
      </div>
    </ComponentShowcase>
  );
}
