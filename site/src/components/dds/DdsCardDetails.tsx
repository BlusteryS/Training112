import type { ReactNode } from 'react';
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
      <Field label="Указанный номер" text={card.provided_phone} />
      <Field label="Телефон на месте" text={card.scene_phone} />
      <Field label="Канал связи" text={card.communication_channel} />
    </div>;
}

export function DdsCardDetails({ card, assignment, statusEditor }: {
  card: Record<string, string>;
  assignment: Assignment | null;
  statusEditor: ReactNode;
}) {
  const facts = assignment?.facts;
  const addressParts: [string, string | undefined][] = [
    ['Округ', card.okrug], ['Район', card.district], ['Объект', card.object],
    ['Улица', card.street], ['Дом', card.house], ['Подъезд', card.entrance], ['Этаж', card.floor],
  ];
  const visibleAddressParts = addressParts.filter((entry) => entry[1]?.trim());
  return <>
    <div className={styles.callerRow}>
      <Field label="Заявитель" text={card.caller_name || facts?.caller_name} />
      {card.caller_status && <Field label="Статус заявителя" text={card.caller_status} />}
      <Field label="Пострадавшие" text={card.victims || facts?.victims} />
      {card.law_violation === 'true' && <Field label="Правонарушение" text="Да" />}
    </div>
    <div className={styles.columns}>
      <div className={styles.column}>
        <div className={styles.block}>
          <div className={styles.blockTitle}>Адрес происшествия</div>
          <div className={styles.strong}>{value(card.address || facts?.address)}</div>
          {visibleAddressParts.length > 0 && <div className={styles.addressFields}>
            {visibleAddressParts.map(([label, text]) => <Field key={label} label={label} text={text} />)}
          </div>}
          {(card.address_description || card.landmark) &&
            <Field label="Ориентир и описание адреса" text={card.address_description || card.landmark} />}
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
        {statusEditor}
      </div>
    </div>
  </>;
}
