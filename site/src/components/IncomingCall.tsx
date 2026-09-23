import type { Assignment } from '../management/types';
import closeIcon from '../assets/workspace/close.svg';
import styles from './IncomingCall.module.css';

export function IncomingCall({ assignment, onAccept, onClose }: {
  assignment: Assignment;
  onAccept: () => void;
  onClose: () => void;
}) {
  const phone = assignment.caller_phone?.trim();

  return <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Входящий звонок">
    <div className={styles.call}>
      <div className={styles.details}>
        <div className={styles.title}>Входящий звонок</div>
        <div className={styles.number}>{phone ? `С номера телефона ${phone}` : 'Номер телефона не определён'}</div>
      </div>
      <button className={styles.accept} autoFocus onClick={onAccept}>Принять</button>
      <button className={styles.close} onClick={onClose} aria-label="Закрыть">
        <img src={closeIcon} alt="" />
      </button>
    </div>
  </div>;
}
