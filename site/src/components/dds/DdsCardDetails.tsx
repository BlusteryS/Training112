import type { ReactNode } from 'react';
import type { DdsCard } from '../../speech/trainingApi';
import { questionLabel } from '../call/incidentQuestionSet';
import styles from './DdsCardDetails.module.css';

function value(text?: string | null) {
  return text?.trim() || '—';
}

function additionalTypes(card: DdsCard) {
  try {
    const types: unknown = JSON.parse(card.incident_types);
    if (!Array.isArray(types)) return [];
    return types.slice(1).filter((item): item is { type: string; sign2: string; sign3: string } =>
      item !== null && typeof item === 'object' && typeof item.type === 'string'
      && typeof item.sign2 === 'string' && typeof item.sign3 === 'string');
  } catch {
    return [];
  }
}

function surveyAnswers(card: DdsCard) {
  try {
    const parsed: unknown = JSON.parse(card.survey_answers);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    return Object.entries(parsed).flatMap(([code, answers]) => {
      if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return [];
      return Object.entries(answers).filter((entry): entry is [string, string] =>
        typeof entry[1] === 'string' && Boolean(entry[1].trim()))
        .map(([key, answer]) => ({ code, label: questionLabel(key), answer: answer.replaceAll('|', ', ') }));
    });
  } catch { return []; }
}

function Field({ label, text }: { label: string; text?: string | null }) {
  return <div className={styles.field}><span>{label}</span><div>{value(text)}</div></div>;
}

export function DdsCardContacts({ card }: {
  card: DdsCard;
}) {
  return <div className={styles.phoneRow}>
      <Field label="АОН" text={card.phone} />
      <Field label="Указанный номер" text={card.provided_phone} />
      <Field label="Телефон на месте" text={card.scene_phone} />
      <Field label="Канал связи" text={card.communication_channel} />
    </div>;
}

export function DdsCardDetails({ card, statusEditor }: {
  card: DdsCard;
  statusEditor: ReactNode;
}) {
  const addressParts: [string, string | undefined][] = [
    ['Округ', card.okrug], ['Район', card.district], ['Объект', card.object],
    ['Улица', card.street], ['Дом', card.house], ['Корпус', card.building],
    ['Строение', card.structure], ['Квартира / офис', card.apartment],
    ['Подъезд', card.entrance], ['Этаж', card.floor], ['Код подъезда', card.entry_code],
  ];
  const visibleAddressParts = addressParts.filter((entry) => entry[1]?.trim());
  return <>
    <div className={styles.callerRow}>
      <Field label="Заявитель" text={card.caller_name} />
      {card.caller_status && <Field label="Статус заявителя" text={card.caller_status} />}
      {card.birth_date && <Field label="Дата рождения" text={card.birth_date} />}
      {card.residence && <Field label="Место жительства" text={card.residence} />}
      <Field label="Пострадавшие" text={card.victims} />
      {card.medical_help && <Field label="Медпомощь" text={card.medical_help} />}
      {card.blocked_people && <Field label="Заблокированные люди" text={card.blocked_people} />}
      {card.law_violation === 'true' && <Field label="Правонарушение" text="Да" />}
    </div>
    <div className={styles.columns}>
      <div className={styles.block}>
        <div className={styles.blockTitle}>Адрес происшествия</div>
        <div className={styles.strong}>{value(card.address)}</div>
        {visibleAddressParts.length > 0 && <div className={styles.addressFields}>
          {visibleAddressParts.map(([label, text]) => <Field key={label} label={label} text={text} />)}
        </div>}
        {card.address_description && <Field label="Описание адреса" text={card.address_description} />}
        {card.landmark && <Field label="Ориентир" text={card.landmark} />}
      </div>
      <div className={styles.block}>
        <div className={styles.blockTitle}>Происшествие</div>
        <div className={styles.strong}>{value(card.incident_code)}</div>
        {card.incident_sign_2 && <Field label="Признак" text={card.incident_sign_2} />}
        {card.incident_sign_3 && <Field label="Уточнение" text={card.incident_sign_3} />}
        {additionalTypes(card).map((item, index) => <Field key={index}
          label={`Дополнительный тип ${index + 1}`}
          text={[item.type, item.sign2, item.sign3].filter(Boolean).join(' · ')} />)}
        {card.incident_details && <Field label="Подробности" text={card.incident_details} />}
        {surveyAnswers(card).map((item) => <Field key={`${item.code}:${item.label}`}
          label={item.label} text={item.answer} />)}
        <Field label="Источник обращения" text={card.origin} />
      </div>
    </div>
    <div className={styles.block}>
      <div className={styles.blockTitle}>Описание со слов заявителя</div>
      <div className={styles.description}>{value(card.description)}</div>
    </div>
    {statusEditor}
  </>;
}
