import globeIcon from '../../assets/call/globe.svg';
import styles from './PhoneCard.module.css';

export function PhoneCard({ id, label, value, placeholder, onChange, onCopy, foreign, onForeignChange }: {
  id?: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  onCopy?: () => void;
  foreign?: boolean;
  onForeignChange?: (value: boolean) => void;
}) {
  return <div className={styles.card}>
    <div className={styles.content}>
      <div className={styles.head}>
        <span>{label}</span>
        {onForeignChange && <button className={foreign ? styles.selected : ''} type="button"
          onClick={() => onForeignChange(!foreign)} title="Зарубежный номер">
          <img src={globeIcon} alt="" />
        </button>}
      </div>
      <div className={styles.numberRow}>
        {onChange ? <input id={id} value={value} onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder ?? '+X (XXX) XXX XX-XX'} />
          : <div id={id} tabIndex={id ? -1 : undefined} className={styles.number}>{value || 'Номер не определён'}</div>}
        {onCopy && <button className={styles.copy} type="button" onClick={onCopy}>АОН</button>}
      </div>
    </div>
  </div>;
}
