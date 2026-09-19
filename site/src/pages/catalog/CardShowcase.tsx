import { Card, type CardAppearance } from '@training112/components/Card';
import { IconButton } from '@training112/components/IconButton';
import { Tab } from '@training112/components/Tab';
import { Tabs } from '@training112/components/Tabs';
import { Icon20Placeholder } from '@training112/icons';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';
import styles from './Showcase.module.css';

const appearances: CardAppearance[] = [
  'default',
  'primary',
  'accent',
  'error',
  'valid',
  'warning',
  'important',
];
const documentation: DocumentationRow[] = [
  {
    name: 'appearance',
    description: 'Оформление карточки',
    values: appearances,
  },
  {
    name: 'stretched',
    description: 'Растягивает карточку',
    values: ['boolean'],
  },
  {
    name: 'withBorder',
    description: 'Тонкая рамка по контуру карточки',
    values: ['boolean'],
  },
  {
    name: 'media',
    description: 'Изображение или другое содержимое над заголовком',
    values: ['ReactNode'],
  },
  {
    name: 'subhead',
    description: 'Дополнительный текст над заголовком, 13 px',
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
    name: 'title',
    description: 'Заголовок карточки, 14 px',
    values: ['ReactNode'],
  },
  {
    name: 'subtitle',
    description: 'Дополнительный текст под заголовком, 13 px',
    values: ['ReactNode'],
  },
  {
    name: 'children',
    description: 'Произвольное содержимое',
    values: ['ReactNode'],
  },
];
const codeExample = `
<Card
  before={<span>Before</span>}
  after={<span>After</span>}
  subhead="Subhead"
  subtitle="Subtitle"
  title="Title"
>
  <Tabs defaultSelectedId="first" layoutFillMode="shrinked">
    <Tab id="first">Tab</Tab>
    <Tab id="second">Tab</Tab>
    <Tab id="third">Tab</Tab>
  </Tabs>
</Card>
`;
const demoIcon = <Icon20Placeholder />;
const demoIconButton = (
  <IconButton aria-label="Действие" size="large">
    <Icon20Placeholder />
  </IconButton>
);
const tabIds = ['first', 'second', 'third', 'fourth'];

function DemoTabs() {
  return (
    <div className={styles.cardTabs}>
      <Tabs defaultSelectedId="first" layoutFillMode="shrinked">
        {tabIds.map((id) => (
          <Tab before={demoIcon} id={id} key={id}>
            Tab
          </Tab>
        ))}
      </Tabs>
    </div>
  );
}

export default function CardShowcase() {
  return (
    <ComponentShowcase code={codeExample} documentation={documentation} name="Card">
      <div className={styles.cardList}>
        <Card
          after={demoIconButton}
          before={demoIcon}
          subtitle="Subtitle"
          title="Title"
        >
          <DemoTabs />
        </Card>

        <Card appearance="primary">
          <DemoTabs />
        </Card>

        <Card
          appearance="primary"
          media={<div className={styles.cardMedia}>{demoIcon}</div>}
          subhead="Над заголовком"
          subtitle="Под заголовком"
          title="Карточка с рамкой"
          withBorder
        />

        {appearances.slice(2).map((appearance) => (
          <Card
            appearance={appearance}
            key={appearance}
            title="Это пример карточки!"
          />
        ))}
      </div>
    </ComponentShowcase>
  );
}
