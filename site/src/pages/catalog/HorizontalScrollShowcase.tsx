import { Card } from '@training112/components/Card';
import { HorizontalScroll } from '@training112/components/HorizontalScroll';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';
import styles from './Showcase.module.css';

const documentation: DocumentationRow[] = [
  {
    name: 'children',
    description: 'Горизонтальный ряд элементов с прокруткой перетаскиванием мышью, свайпом или стрелками',
    values: ['ReactNode'],
  },
  {
    name: 'aria-label',
    description: 'Доступное название области прокрутки',
    values: ['string'],
  },
  {
    name: 'bleed',
    description: 'Растягивает ленту за пределы колонки PageLayout. Крайние элементы выровнены по колонке, стрелки расположены по краям области прокрутки',
    values: ['boolean'],
  },
  {
    name: 'showArrows',
    description: 'Показывает стрелки, если в соответствующем направлении есть содержимое. По умолчанию true',
    values: ['boolean'],
  },
];
const codeExample = `
<HorizontalScroll aria-label="Карточки">
  <div style={{ display: 'flex', gap: 8 }}>
    {items.map((item) => (
      <Card key={item.id} style={{ width: 180, flexShrink: 0 }} title={item.title} />
    ))}
  </div>
</HorizontalScroll>
`;
const items = Array.from({ length: 8 }, (_, index) => index + 1);

export default function HorizontalScrollShowcase() {
  return (
    <ComponentShowcase code={codeExample} documentation={documentation} name="HorizontalScroll">
      <HorizontalScroll aria-label="Пример горизонтальной ленты">
        <div className={styles.horizontalScrollItems} role="list">
          {items.map((number) => (
            <Card
              appearance="primary"
              className={styles.horizontalScrollCard}
              key={number}
              role="listitem"
              subhead="Горизонтальная лента"
                subtitle="Прокручивается мышью, свайпом или стрелками"
              title={`Карточка ${number}`}
              withBorder
            />
          ))}
        </div>
      </HorizontalScroll>
    </ComponentShowcase>
  );
}
