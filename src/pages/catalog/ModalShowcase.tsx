import { Button } from '../../components/Button';
import { useModal } from '../../modals';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';

const documentation: DocumentationRow[] = [
  {
    name: 'size',
    description: 'Максимальная ширина формы',
    values: ['small', 'medium', 'large'],
  },
  {
    name: 'title',
    description: 'Заголовок формы',
    values: ['ReactNode'],
  },
  {
    name: 'subtitle',
    description: 'Дополнительный текст',
    values: ['ReactNode'],
  },
  {
    name: 'children',
    description: 'Содержимое формы',
    values: ['ReactNode'],
  },
  {
    name: 'footerBefore',
    description: 'Содержимое слева внизу',
    values: ['ReactNode'],
  },
  {
    name: 'actions',
    description: 'Кнопки формы',
    values: ['ReactNode'],
  },
  {
    name: 'onClose',
    description: 'Обработчик закрытия',
    values: ['() => void'],
  },
];
const codeExample = `
export function ModalTrigger() {
  const modal = useModal();

  return (
    <Button onClick={() => modal.open('form')}>
      Открыть форму
    </Button>
  );
}

export function FormModal() {
  const modal = useModal();
  const actions = (
    <>
      <Button mode="outline">Отмена</Button>
      <Button>Сохранить</Button>
    </>
  );

  return (
    <ModalForm
      actions={actions}
      onClose={modal.close}
      size="large"
      subtitle="Subtitle"
      title="Title"
    >
      Это модальная форма!
    </ModalForm>
  );
}
`;

export default function ModalShowcase() {
  const modal = useModal();

  return (
    <ComponentShowcase code={codeExample} documentation={documentation} name="Modal">
      <Button onClick={() => modal.open('form')}>Открыть форму</Button>
    </ComponentShowcase>
  );
}
