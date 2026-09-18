import { Card } from '../../components/Card';
import { Separator } from '../../components/Separator';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';

const documentation: DocumentationRow[] = [
  {
    name: 'paddingHorizontal',
    description: 'Добавляет отступ по бокам',
    values: ['boolean'],
  },
  {
    name: 'paddingVertical',
    description: 'Добавляет отступ сверху и снизу',
    values: ['boolean'],
  },
];
const codeExample = `
<Separator paddingHorizontal paddingVertical />
`;

export default function SeparatorShowcase() {
  return (
    <ComponentShowcase code={codeExample} documentation={documentation} name="Separator">
      <Card appearance="primary">
        <Separator paddingHorizontal paddingVertical />
      </Card>
    </ComponentShowcase>
  );
}
