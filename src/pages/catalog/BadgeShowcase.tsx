import { ExternalLink } from 'lucide-react';
import { Badge, type BadgeColor } from '../../components/Badge';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';
import styles from './Showcase.module.css';

const badgeVariants: Array<{ color: BadgeColor; label: string }> = [
  { color: 'white', label: 'Badge' },
  { color: 'blue', label: 'Brand' },
  { color: 'inverted', label: 'Inverted' },
  { color: 'success', label: 'Success' },
  { color: 'error', label: 'Error' },
  { color: 'warning', label: 'Warning' },
];
const demoIcon = <ExternalLink size={16} strokeWidth={1.5} />;
const documentation: DocumentationRow[] = [
  {
    name: 'children',
    description: 'Содержимое бейджа',
    values: ['ReactNode'],
  },
  {
    name: 'color',
    description: 'Цветовая схема',
    values: ['white', 'blue', 'inverted', 'success', 'error', 'warning'],
  },
  {
    name: 'variant',
    description: 'Стиль оформления',
    values: ['fill', 'outline'],
  },
  {
    name: 'before',
    description: 'Содержимое перед текстом',
    values: ['ReactNode'],
  },
];
const codeExample = `
<Badge color="blue">
  Brand
</Badge>
`;

export default function BadgeShowcase() {
  return (
    <ComponentShowcase code={codeExample} documentation={documentation} name="Badge">
      <div className={styles.badgeGrid}>
        {badgeVariants.map(({ color, label }, index) => (
          <Badge
            color={color}
            before={demoIcon}
            key={`fill-${color}`}
            style={{ gridRow: index + 1 }}
          >
            {label}
          </Badge>
        ))}

        {badgeVariants.slice(1).map(({ color, label }, index) => (
          <Badge
            color={color as Exclude<BadgeColor, 'white'>}
            before={demoIcon}
            key={`outline-${color}`}
            style={{ gridColumn: 2, gridRow: index + 2 }}
            variant="outline"
          >
            {label}
          </Badge>
        ))}
      </div>
    </ComponentShowcase>
  );
}
