import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Placeholder } from '../../components/Placeholder';
import { Icon20Placeholder } from '../../icons';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';

const documentation: DocumentationRow[] = [
  {
    name: 'icon',
    description: 'Содержимое над заголовком',
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
    name: 'actions',
    description: 'Действия под текстом',
    values: ['ReactNode'],
  },
];
const codeExample = `
<Placeholder
  actions={<Button size="large">Продолжить</Button>}
  subtitle={
    <>
      Вы получили 3 балла в копилку.
      <br />
      Перейдём к следующему этапу?
    </>
  }
  title="Верный ответ"
/>
`;

export default function PlaceholderShowcase() {
  return (
    <ComponentShowcase code={codeExample} documentation={documentation} name="Placeholder">
      <Card appearance="primary">
        <Placeholder
          actions={<Button size="large">Продолжить</Button>}
          icon={<Icon20Placeholder height={88} width={88} />}
          subtitle={
            <>
              Вы получили 3 балла в копилку.
              <br />
              Перейдём к следующему этапу?
            </>
          }
          title="Верный ответ"
        />
      </Card>
    </ComponentShowcase>
  );
}
