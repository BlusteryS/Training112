import { ExternalLink } from 'lucide-react';
import {
  Button,
  type ButtonAppearance,
  type ButtonMode,
  type ButtonSize,
} from '../../components/Button';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';
import styles from './Showcase.module.css';

const buttonRows: Array<{
  appearance: Exclude<ButtonAppearance, 'inversion'>;
  mode: ButtonMode;
}> = [
  { appearance: 'accent', mode: 'fill' },
  { appearance: 'accent', mode: 'outline' },
  { appearance: 'negative', mode: 'fill' },
  { appearance: 'negative', mode: 'outline' },
  { appearance: 'positive', mode: 'fill' },
  { appearance: 'positive', mode: 'outline' },
];
const buttonSizes: ButtonSize[] = ['medium', 'large'];
const demoIcon = <ExternalLink size={16} strokeWidth={1.5} />;
const documentation: DocumentationRow[] = [
  {
    name: 'children',
    description: 'Содержимое кнопки',
    values: ['ReactNode'],
  },
  {
    name: 'appearance',
    description: 'Цветовая схема',
    values: ['accent', 'negative', 'positive', 'inversion'],
  },
  {
    name: 'mode',
    description: 'Стиль оформления',
    values: ['fill', 'outline'],
  },
  {
    name: 'size',
    description: 'Размер кнопки',
    values: ['medium', 'large'],
  },
  {
    name: 'state',
    description: 'Состояние в превью',
    values: ['default', 'pressed'],
  },
  {
    name: 'disabled',
    description: 'Отключённое состояние',
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
];
const codeExample = `
<Button appearance="accent" size="medium">
  Button
</Button>
`;

export default function ButtonShowcase() {
  return (
    <ComponentShowcase code={codeExample} documentation={documentation} name="Button">
      <div className={styles.buttonCanvas}>
        {buttonSizes.map((size) => (
          <div className={styles.buttonSizeGroup} data-size={size} key={size}>
            {buttonRows.flatMap(({ appearance, mode }, rowIndex) => {
              const position = { gridRow: rowIndex + 1 };

              return [
                <Button
                  after={demoIcon}
                  appearance={appearance}
                  before={demoIcon}
                  key={`${appearance}-${mode}-default`}
                  mode={mode}
                  size={size}
                  style={{ ...position, gridColumn: 1 }}
                >
                  Button
                </Button>,
                <Button
                  after={demoIcon}
                  appearance={appearance}
                  before={demoIcon}
                  key={`${appearance}-${mode}-pressed`}
                  mode={mode}
                  size={size}
                  state="pressed"
                  style={{ ...position, gridColumn: 2 }}
                >
                  Button
                </Button>,
                <Button
                  after={demoIcon}
                  appearance={appearance}
                  disabled
                  before={demoIcon}
                  key={`${appearance}-${mode}-disabled`}
                  mode={mode}
                  size={size}
                  style={{ ...position, gridColumn: 3 }}
                >
                  Button
                </Button>,
              ];
            })}

            <Button
              after={demoIcon}
              appearance="inversion"
              before={demoIcon}
              size={size}
              style={{ gridColumn: 1, gridRow: 7 }}
            >
              Button
            </Button>
            <Button
              after={demoIcon}
              appearance="inversion"
              disabled
              before={demoIcon}
              size={size}
              style={{ gridColumn: 3, gridRow: 7 }}
            >
              Button
            </Button>
          </div>
        ))}
      </div>
    </ComponentShowcase>
  );
}
