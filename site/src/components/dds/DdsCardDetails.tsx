import type { Assignment } from '../../management/types';
import styles from './DdsCardDetails.module.css';

function value(text?: string | null) {
  return text?.trim() || '—';
}

function Field({ label, text }: { label: string; text?: string | null }) {
  return <div className={styles.field}><span>{label}</span><div>{value(text)}</div></div>;
}

export function DdsCardDetails({ card, assignment }: {
  card: Record<string, string>;
  assignment: Assignment | null;
}) {
  const facts = assignment?.facts;
  return <>
    <div className={styles.phoneRow}>
      <Field label="АОН" text={card.phone || facts?.phone} />
      <Field label="Предоставленный номер" text={card.provided_phone} />
      <Field label="Телефон на месте происшествия" text={card.scene_phone} />
      <Field label="Канал связи" text={card.communication_channel} />
    </div>
    <div className={styles.callerRow}>
      <Field label="Заявитель" text={card.caller_name || facts?.caller_name} />
      <Field label="Статус заявителя" text={card.caller_status} />
      <Field label="Пострадавшие" text={card.victims || facts?.victims} />
    </div>
    <div className={styles.columns}>
      <div className={styles.column}>
        <div className={styles.block}>
          <div className={styles.blockTitle}>Адрес происшествия</div>
          <div className={styles.strong}>{value(card.address || facts?.address)}</div>
          <div className={styles.addressFields}>
            <Field label="Округ" text={card.okrug} />
            <Field label="Район" text={card.district} />
            <Field label="Объект" text={card.object} />
            <Field label="Улица" text={card.street} />
            <Field label="Дом" text={card.house} />
            <Field label="Подъезд" text={card.entrance} />
            <Field label="Этаж" text={card.floor} />
          </div>
          <Field label="Ориентир и описание адреса" text={card.address_description || card.landmark} />
        </div>
        <div className={styles.block}>
          <div className={styles.blockTitle}>Описание со слов заявителя</div>
          <div className={styles.description}>{value(card.description || facts?.incident)}</div>
        </div>
      </div>
      <div className={styles.column}>
        <div className={styles.block}>
          <div className={styles.blockTitle}>Происшествие</div>
          <div className={styles.strong}>{value(card.incident_code || assignment?.title)}</div>
          {card.incident_sign_2 && <Field label="Признак" text={card.incident_sign_2} />}
          {card.incident_sign_3 && <Field label="Уточнение" text={card.incident_sign_3} />}
          {card.incident_details && <Field label="Подробности" text={card.incident_details} />}
          <Field label="Источник обращения" text={card.origin || assignment?.origin} />
        </div>
      </div>
    </div>
  </>;
}
