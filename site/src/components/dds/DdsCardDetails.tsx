import type { Assignment } from '../../management/types';
import styles from './DdsCardDetails.module.css';

function value(text?: string | null) {
  return text?.trim() || '—';
}

function additionalTypes(card: Record<string, string>) {
  try {
    const types: unknown = JSON.parse(card.incident_types ?? '[]');
    if (!Array.isArray(types)) return [];
    return types.slice(1).filter((item): item is { type: string; sign2: string; sign3: string } =>
      item !== null && typeof item === 'object' && typeof item.type === 'string'
      && typeof item.sign2 === 'string' && typeof item.sign3 === 'string');
  } catch {
    return [];
  }
}

function Field({ label, text }: { label: string; text?: string | null }) {
  return <div className={styles.field}><span>{label}</span><div>{value(text)}</div></div>;
}

export function DdsCardContacts({ card, assignment }: {
  card: Record<string, string>;
  assignment: Assignment | null;
}) {
  const facts = assignment?.facts;
  return <div className={styles.phoneRow}>
      <Field label="АОН" text={card.phone || facts?.phone} />
      <Field label="Предоставленный номер" text={card.provided_phone} />
      <Field label="Телефон на месте происшествия" text={card.scene_phone} />
      <Field label="Канал связи" text={card.communication_channel} />
    </div>;
}

export function DdsCardDetails({ card, assignment }: {
  card: Record<string, string>;
  assignment: Assignment | null;
}) {
  const facts = assignment?.facts;
  return <>
    <div className={styles.callerRow}>
      <Field label="Заявитель" text={card.caller_name || facts?.caller_name} />
      <Field label="Статус заявителя" text={card.caller_status} />
      <Field label="Пострадавшие" text={card.victims || facts?.victims} />
      {card.law_violation === 'true' && <Field label="Правонарушение" text="Да" />}
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
          {additionalTypes(card).map((item, index) => <Field key={index}
            label={`Дополнительный тип ${index + 1}`}
            text={[item.type, item.sign2, item.sign3].filter(Boolean).join(' · ')} />)}
          {card.incident_details && <Field label="Подробности" text={card.incident_details} />}
          <Field label="Источник обращения" text={card.origin || assignment?.origin} />
        </div>
      </div>
    </div>
  </>;
}
