import styles from './SaveCardDialog.module.css';

export function SaveCardDialog({ services, warnings, error, saving, specialReason, onConfirm, onReturn }: {
  services: string[];
  warnings: string[];
  error: string;
  saving: boolean;
  specialReason: string;
  onConfirm: () => void;
  onReturn: () => void;
}) {
  return <div className={styles.overlay} role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !saving) onReturn();
  }}>
    <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="save-card-title">
      <div id="save-card-title" className={styles.title}>
        {specialReason ? 'Сохранить карточку без контакта?' : 'Сохранить карточку происшествия?'}
      </div>
      {specialReason && <div className={styles.special}>Причина: {specialReason}. Карточка будет завершена без оповещения служб.</div>}
      <div className={styles.sectionTitle}>Службы, которым будет передана карточка</div>
      {services.length ? <div className={styles.services}>{services.map((service) => <span key={service}>{service}</span>)}</div>
        : <div className={styles.empty}>Службы не выбраны.</div>}
      {warnings.length > 0 && <div className={styles.warning} role="alert">
        <div>Заполните обязательные поля:</div>
        <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
      </div>}
      {error && <div className={styles.error} role="alert">Не удалось сохранить карточку: {error}</div>}
      <div className={styles.actions}>
        <button type="button" disabled={saving} onClick={onReturn}>Вернуться к заполнению</button>
        <button className={styles.primary} type="button" disabled={saving || warnings.length > 0} onClick={onConfirm}>
          Оповестить и сохранить карточку
        </button>
      </div>
    </div>
  </div>;
}
