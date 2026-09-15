import { Button } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import { ModalForm } from '../components/ModalForm';
import { PlaceholderIcon } from '../icons/PlaceholderIcon';
import { useModal } from './useModal';
import styles from './ModalRoute.module.css';

export function ModalRoute() {
  const modal = useModal();
  const actionIcon = <PlaceholderIcon />;

  return (
    <ModalForm
      actions={
        <>
          <Button
            appearance="accent"
            before={actionIcon}
            mode="outline"
          >
            Button
          </Button>
          <Button
            appearance="accent"
            before={actionIcon}
            mode="outline"
          >
            Button
          </Button>
          <Button appearance="accent" before={actionIcon}>
            Button
          </Button>
        </>
      }
      footerBefore={
        <Checkbox subtitle="Subtitle">
          Title
        </Checkbox>
      }
      onClose={modal.close}
      size="large"
      subtitle="Subtitle"
      title="Title"
    >
      <div className={styles.content}>Это модальная форма!</div>
    </ModalForm>
  );
}
