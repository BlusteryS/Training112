import {
  IconButton,
  type IconButtonAppearance,
  type IconButtonSize,
} from '../../components/IconButton';
import { PlaceholderIcon } from '../../icons/PlaceholderIcon';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';
import styles from './Showcase.module.css';

const appearances: IconButtonAppearance[] = ['primary', 'tertiary'];
const sizes: IconButtonSize[] = ['small', 'medium'];
const documentation: DocumentationRow[] = [
  {
    name: 'children',
    description: 'Иконка кнопки',
    values: ['ReactNode'],
  },
  {
    name: 'aria-label',
    description: 'Доступное название',
    values: ['string'],
  },
  {
    name: 'appearance',
    description: 'Цвет иконки',
    values: appearances,
  },
  {
    name: 'size',
    description: 'Размер кнопки',
    values: sizes,
  },
  {
    name: 'disabled',
    description: 'Отключённое состояние',
    values: ['boolean'],
  },
];
const codeExample = `
<IconButton aria-label="Действие">
  {/* Ваша иконка */}
</IconButton>
`;

export default function IconButtonShowcase() {
  return (
    <ComponentShowcase code={codeExample} documentation={documentation} name="IconButton">
      <div className={styles.iconButtonGrid}>
        {sizes.flatMap((size) =>
          appearances.map((appearance) => (
            <IconButton
              appearance={appearance}
              aria-label={`${size} ${appearance}`}
              key={`${size}-${appearance}`}
              size={size}
            >
              <PlaceholderIcon />
            </IconButton>
          )),
        )}
      </div>
    </ComponentShowcase>
  );
}
