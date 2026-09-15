import { Button } from '../../components/Button';
import { useSnackbar } from '../../components/Snackbar';
import { PlaceholderIcon } from '../../icons/PlaceholderIcon';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';

const documentation: DocumentationRow[] = [
  {
    name: 'title',
    description: 'Заголовок уведомления',
    values: ['ReactNode'],
  },
  {
    name: 'subtitle',
    description: 'Дополнительный текст',
    values: ['ReactNode'],
  },
  {
    name: 'before',
    description: 'Содержимое перед текстом',
    values: ['ReactNode'],
  },
  {
    name: 'duration',
    description: 'Время показа, 0 — до закрытия',
    values: ['number', '3000'],
  },
  {
    name: 'closeLabel',
    description: 'Название кнопки закрытия',
    values: ['string'],
  },
  {
    name: 'onClose',
    description: 'Обработчик закрытия',
    values: ['() => void'],
  },
];
const codeExample = `
export function SnackbarTrigger() {
  const snackbar = useSnackbar();

  return (
    <Button
      onClick={() =>
        snackbar.open({
          subtitle: 'Изменения сохранены',
          title: 'Готово',
        })
      }
    >
      Показать уведомление
    </Button>
  );
}
`;

export default function SnackbarShowcase() {
  const snackbar = useSnackbar();

  return (
    <ComponentShowcase code={codeExample} documentation={documentation} name="Snackbar">
      <Button
        onClick={() =>
          snackbar.open({
            before: <PlaceholderIcon />,
            subtitle: 'Subtitle',
            title: 'Title',
          })
        }
      >
        Показать уведомление
      </Button>
    </ComponentShowcase>
  );
}
