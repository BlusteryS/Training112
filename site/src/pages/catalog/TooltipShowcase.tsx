import { Button } from '@training112/components/Button';
import { Tooltip, type TooltipPlacement } from '@training112/components/Tooltip';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';
import styles from './Showcase.module.css';

const placements: TooltipPlacement[] = [
  'top-start',
  'top',
  'top-end',
  'right-start',
  'right',
  'right-end',
  'bottom-start',
  'bottom',
  'bottom-end',
  'left-start',
  'left',
  'left-end',
];
const documentation: DocumentationRow[] = [
  {
    name: 'children',
    description: 'Целевой элемент',
    values: ['ReactElement'],
  },
  {
    name: 'title',
    description: 'Заголовок подсказки',
    values: ['ReactNode'],
  },
  {
    name: 'description',
    description: 'Дополнительный текст',
    values: ['ReactNode'],
  },
  {
    name: 'placement',
    description: 'Положение подсказки',
    values: placements,
  },
  {
    name: 'shown',
    description: 'Управляемая видимость',
    values: ['boolean'],
  },
  {
    name: 'defaultShown',
    description: 'Начальная видимость',
    values: ['boolean'],
  },
  {
    name: 'onShownChange',
    description: 'Обработчик видимости',
    values: ['(shown: boolean) => void'],
  },
  {
    name: 'maxWidth',
    description: 'Максимальная ширина',
    values: ['number', 'string'],
  },
  {
    name: 'offsetByMainAxis',
    description: 'Отступ от элемента',
    values: ['number'],
  },
  {
    name: 'offsetByCrossAxis',
    description: 'Смещение по оси',
    values: ['number'],
  },
  {
    name: 'disableFlipMiddleware',
    description: 'Запрещает смену стороны',
    values: ['boolean'],
  },
];
const codeExample = `
<Tooltip
  description="Subtitle"
  placement="right"
  title="Title"
>
  <Button>Наведи</Button>
</Tooltip>
`;

export default function TooltipShowcase() {
  return (
    <ComponentShowcase code={codeExample} documentation={documentation} name="Tooltip">
      <div className={styles.tooltipGrid}>
        {placements.map((placement) => (
          <Tooltip
            description="Subtitle"
            key={placement}
            placement={placement}
            title="Title"
          >
            <Button mode="outline">{placement}</Button>
          </Tooltip>
        ))}
      </div>
    </ComponentShowcase>
  );
}
