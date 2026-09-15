import { Checkbox, type CheckboxVariant } from '../../components/Checkbox';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';
import styles from './Showcase.module.css';

const variants: CheckboxVariant[] = ['checkbox', 'radio'];
const states = [
  { checked: true, indeterminate: false, name: 'on' },
  { checked: false, indeterminate: true, name: 'mixed' },
  { checked: false, indeterminate: false, name: 'off' },
] as const;
const documentation: DocumentationRow[] = [
  {
    name: 'variant',
    description: 'Форма контрола',
    values: ['checkbox', 'radio'],
  },
  {
    name: 'checked',
    description: 'Выбранное состояние',
    values: ['boolean'],
  },
  {
    name: 'indeterminate',
    description: 'Смешанное состояние',
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
<Checkbox
  aria-label="Выбрать элемент"
  checked
/>
`;

export default function CheckboxShowcase() {
  return (
    <ComponentShowcase code={codeExample} documentation={documentation} name="Checkbox">
      <div className={styles.checkboxCanvas}>
        {variants.map((variant) => (
          <div className={styles.checkboxGroup} key={variant}>
            {states.map(({ checked, indeterminate, name }) => (
              <Checkbox
                aria-label={`${variant} ${name}`}
                checked={checked}
                indeterminate={indeterminate}
                key={`${variant}-${name}-active`}
                readOnly
                variant={variant}
              />
            ))}
            {states.map(({ checked, indeterminate, name }) => (
              <Checkbox
                aria-label={`${variant} ${name} disabled`}
                checked={checked}
                disabled
                indeterminate={indeterminate}
                key={`${variant}-${name}-disabled`}
                readOnly
                variant={variant}
              />
            ))}
          </div>
        ))}
      </div>
    </ComponentShowcase>
  );
}
