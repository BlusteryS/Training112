import { Button } from '@training112/components/Button';
import { Checkbox } from '@training112/components/Checkbox';
import { ModalForm } from '@training112/components/ModalForm';
import { Icon20Placeholder } from '@training112/icons';
import { useModal } from './useModal';
import styles from './ModalRoute.module.css';

export function ModalRoute() {
  const modal = useModal();
  const actionIcon = <Icon20Placeholder height={16} width={16} />;

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
