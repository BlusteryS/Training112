import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { User } from '../auth/api';
import { PhoneCard } from '../components/call/PhoneCard';
import { IncidentSurvey, type SurveySelection } from '../components/call/IncidentSurvey';
import { ToggleGroup } from '../components/call/ToggleGroup';
import { ModalForm } from '../components/ModalForm';
import { AutosizeTextarea } from '../components/ui/AutosizeTextarea';
import { moscowOkrugs } from '../incidentSources';
import hangupIcon from '../assets/call/hangup.svg';
import languageIcon from '../assets/call/language.svg';
import locationIcon from '../assets/call/location.svg';
import helpIcon from '../assets/call/help.svg';
import plusIcon from '../assets/workspace/plus.svg';
import closeIcon from '../assets/workspace/close.svg';
import { incidentClassifier, matchingCard, servicesForCard,
  type ClassifierCard } from './incidentClassifier';
import styles from './CallWorkspace.module.css';

export type IncidentDraft = {
  phone: string;
  provided_phone: string;
  scene_phone: string;
  communication_channel: string;
  foreign_phone: string;
  caller_name: string;
  caller_status: string;
  foreign_language: string;
  incident_code: string;
  classifier_code: string;
  incident_types: string;
  incident_sign_2: string;
  incident_sign_3: string;
  incident_details: string;
  address: string;
  address_description: string;
  country: string;
  city: string;
  okrug: string;
  district: string;
  street: string;
  house: string;
  entrance: string;
  floor: string;
  description: string;
  victims: string;
  services: string;
  comment: string;
};

function initialDraft(phone: string, card?: Record<string, string> | null): IncidentDraft {
  return {
    phone, provided_phone: '', scene_phone: '', communication_channel: 'Мобильный телефон',
    foreign_phone: 'false', caller_name: '', caller_status: '', foreign_language: 'false',
    incident_code: '', classifier_code: '', incident_types: '[]',
    incident_sign_2: '', incident_sign_3: '', incident_details: '',
    address: '', address_description: '', country: 'Россия', city: 'Москва', okrug: '',
    district: '', street: '', house: '', entrance: '', floor: '', description: '', victims: 'Нет',
    services: '', comment: '', ...card,
  };
}

function splitServices(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function additionalIncidents(card?: Record<string, string> | null): SurveySelection[] {
  try {
    const values: unknown = JSON.parse(card?.incident_types ?? '[]');
    if (!Array.isArray(values)) return [];
    return values.slice(1).filter((item): item is SurveySelection => item !== null
      && typeof item === 'object' && typeof item.type === 'string'
      && typeof item.sign2 === 'string' && typeof item.sign3 === 'string');
  } catch {
    return [];
  }
}

function elapsedParts(seconds: number) {
  return {
    minutes: Math.floor(seconds / 60).toString().padStart(2, '0'),
    seconds: (seconds % 60).toString().padStart(2, '0'),
  };
}

export function CallWorkspace({ user, phone, elapsed, registeredAt, message, connected, initialCard, incidentNumber,
  deadlineSeconds, saving, onEndCall, onCancel, onSave }: {
  user: User;
  phone: string;
  elapsed: number;
  registeredAt: number | null;
  message: string;
  connected: boolean;
  initialCard?: Record<string, string> | null;
  incidentNumber: string;
  deadlineSeconds?: number | null;
  saving: boolean;
  onEndCall: () => void;
  onCancel: () => void;
  onSave: (draft: IncidentDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => initialDraft(phone, initialCard));
  const [confirm, setConfirm] = useState<'save' | 'no-contact' | 'dropped' | null>(null);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [error, setError] = useState('');
  const [classifier, setClassifier] = useState<ClassifierCard[]>([]);
  const [classifierError, setClassifierError] = useState('');
  const [manualServices, setManualServices] = useState(() => splitServices(initialCard?.services ?? ''));
  const [excludedServices, setExcludedServices] = useState<string[]>([]);
  const [extraIncidents, setExtraIncidents] = useState(() => additionalIncidents(initialCard));
  const services = useMemo(() => splitServices(draft.services), [draft.services]);
  const types = useMemo(() => [...new Set(classifier.map((card) => card.type))].sort((a, b) => a.localeCompare(b, 'ru')),
    [classifier]);
  const selectedCard = useMemo(() => matchingCard(classifier, draft.incident_code,
    draft.incident_sign_2, draft.incident_sign_3),
  [classifier, draft.incident_code, draft.incident_sign_2, draft.incident_sign_3]);
  const selectedCards = useMemo(() => [selectedCard, ...extraIncidents.map((item) =>
    matchingCard(classifier, item.type, item.sign2, item.sign3))], [selectedCard, extraIncidents, classifier]);
  const suggestedServices = useMemo(() => [...new Set(selectedCards.flatMap((card) =>
    servicesForCard(card, draft.address, draft.district, draft.okrug, draft.victims)))],
  [selectedCards, draft.address, draft.district, draft.okrug, draft.victims]);
  const serviceOptions = useMemo(() => [...new Set(['101', '102', '103', '104',
    ...classifier.flatMap((card) => card.services), ...classifier.flatMap((card) => card.victim_services),
    ...suggestedServices, ...services])].sort((a, b) => a.localeCompare(b, 'ru')),
  [classifier, suggestedServices, services]);
  const time = elapsedParts(elapsed);

  useEffect(() => {
    let active = true;
    void incidentClassifier().then((cards) => { if (active) setClassifier(cards); })
      .catch(() => { if (active) setClassifierError('Не удалось открыть классификатор происшествий.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const next = [...new Set([...suggestedServices.filter((service) => !excludedServices.includes(service)),
      ...manualServices])].join(', ');
    const all = JSON.stringify([{ type: draft.incident_code, sign2: draft.incident_sign_2,
      sign3: draft.incident_sign_3 }, ...extraIncidents]);
    setDraft((current) => current.services === next && current.classifier_code === (selectedCard?.code ?? '')
      && current.incident_types === all ? current : { ...current, services: next,
        classifier_code: selectedCard?.code ?? '', incident_types: all });
  }, [suggestedServices, manualServices, excludedServices, selectedCard,
    draft.incident_code, draft.incident_sign_2, draft.incident_sign_3, extraIncidents]);

  function change<K extends keyof IncidentDraft>(key: K, value: IncidentDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (selectedCards.some((card) => !card)
      || new Set(selectedCards.map((card) => card?.code)).size !== selectedCards.length) {
      setError('Выберите тип происшествия и все признаки из классификатора.');
      return;
    }
    if (services.length === 0) {
      setError('Добавьте хотя бы одну службу для оповещения.');
      return;
    }
    setError('');
    setConfirm('save');
  }

  async function save() {
    setError('');
    const reason = confirm === 'no-contact' ? 'Нет контакта с заявителем'
      : confirm === 'dropped' ? 'Срыв звонка' : '';
    const value = reason ? { ...draft, comment: reason, incident_code: reason,
      classifier_code: '', incident_types: '[]', incident_sign_2: '', incident_sign_3: '',
      services: '', description: reason } : draft;
    try {
      await onSave(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить карточку.');
    }
  }

  function toggleService(service: string) {
    if (services.includes(service)) {
      setManualServices((current) => current.filter((item) => item !== service));
      if (suggestedServices.includes(service)) setExcludedServices((current) => [...new Set([...current, service])]);
    } else {
      setExcludedServices((current) => current.filter((item) => item !== service));
      if (!suggestedServices.includes(service)) setManualServices((current) => [...new Set([...current, service])]);
    }
  }

  const arm = (user.workstation ?? '000').padStart(3, '0');
  const registered = registeredAt === null ? '' : new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(registeredAt).replace(',', ' в');
  const operatorNumber = user.login.match(/\d+/)?.[0];
  return <div className={styles.page}>
    <div className={styles.top}>
      <div className={styles.callControl}>
        <button type="button" onClick={onEndCall} disabled={!connected} title="Завершить звонок">
          <img src={hangupIcon} alt="" />
        </button>
      </div>
      <div className={styles.phoneGrid}>
        <PhoneCard label="АОН" value={phone} foreign={draft.foreign_phone === 'true'}
          onForeignChange={(value) => change('foreign_phone', String(value))} />
        <PhoneCard label="Предоставленный номер" value={draft.provided_phone}
          onChange={(value) => change('provided_phone', value)} onCopy={() => change('provided_phone', phone)} />
        <PhoneCard label="Телефон на место" value={draft.scene_phone}
          onChange={(value) => change('scene_phone', value)} onCopy={() => change('scene_phone', phone)} />
      </div>
      <div className={styles.incidentMeta}>
        <div className={styles.timer}>
          <span className={styles.timerCaption}><span>Время</span><span>решения</span></span>
          <span className={styles.timerValue}>{time.minutes}</span>
          <span className={styles.timerSeconds}>:{time.seconds}</span>
        </div>
        <div className={styles.metaText}>
          <span className={styles.incidentName}>Происшествие {incidentNumber}</span>
          <span className={styles.metaLines}>
            {registered && <span>Зарег {registered}</span>}
            <span>Опер.{operatorNumber ? ` ${operatorNumber}` : ''}, АРМ {arm}</span>
          </span>
        </div>
      </div>
    </div>

    <form id="incident-card-form" className={styles.form} onSubmit={submit}>
      <div className={styles.callerRow}>
        <input required value={draft.caller_name} onChange={(event) => change('caller_name', event.target.value)}
          placeholder="Заявитель" />
        <select required value={draft.caller_status} onChange={(event) => change('caller_status', event.target.value)}>
          <option value="">Статус заявителя</option>
          <option>Очевидец</option><option>Пострадавший</option><option>Родственник</option>
          <option>Знакомый</option><option>Ребёнок</option><option>Участник</option>
        </select>
        <select value={draft.communication_channel}
          onChange={(event) => change('communication_channel', event.target.value)}>
          <option>Мобильный телефон</option>
          <option>Стационарный телефон</option>
          <option>Устройство без SIM-карты</option>
        </select>
        <button className={draft.foreign_language === 'true' ? styles.languageOn : styles.language}
          type="button" onClick={() => change('foreign_language', String(draft.foreign_language !== 'true'))}>
          <img src={languageIcon} alt="" /> Язык
        </button>
      </div>
      <div className={styles.victimsRow}>
        <span>Есть пострадавшие?</span>
        <ToggleGroup value={draft.victims === 'Нет' ? 'no' : 'yes'}
          options={[{ value: 'yes', label: 'Да' }, { value: 'no', label: 'Нет' }] as const}
          onChange={(value) => change('victims', value === 'yes' ? '1' : 'Нет')} />
        {draft.victims !== 'Нет' && <input className={styles.count} min="1" type="number"
          value={draft.victims} onChange={(event) => change('victims', event.target.value)}
          aria-label="Количество пострадавших" />}
      </div>
      <div className={styles.quickActions}>
        <button type="button" onClick={() => setConfirm('no-contact')}>Нет контакта</button>
        <button type="button" onClick={() => setConfirm('dropped')}>Срыв звонка</button>
      </div>

      <div className={styles.addressPanel}>
        <div className={styles.panelTitle}>Адрес <img src={locationIcon} alt="" /></div>
        <input required value={draft.address} onChange={(event) => change('address', event.target.value)}
          placeholder="Адрес с номером дома" />
        <div className={styles.addressGrid}>
          <label>Страна<input value={draft.country} onChange={(event) => change('country', event.target.value)} /></label>
          <label>Город<input value={draft.city} onChange={(event) => change('city', event.target.value)} /></label>
          <label>Округ<select required value={draft.okrug} onChange={(event) => change('okrug', event.target.value)}>
            <option value=""></option>
            {moscowOkrugs.map((okrug) => <option key={okrug} value={okrug}>{okrug}</option>)}
          </select></label>
          <label>Район<input value={draft.district} onChange={(event) => change('district', event.target.value)} /></label>
          <label>Улица<input value={draft.street} onChange={(event) => change('street', event.target.value)} /></label>
          <label>Дом<input value={draft.house} onChange={(event) => change('house', event.target.value)} /></label>
          <label>Подъезд<input value={draft.entrance} onChange={(event) => change('entrance', event.target.value)} /></label>
          <label>Этаж<input value={draft.floor} onChange={(event) => change('floor', event.target.value)} /></label>
        </div>
        <label className={styles.description}>Описательный адрес
          <AutosizeTextarea maxLength={1999} value={draft.address_description}
            onChange={(event) => change('address_description', event.target.value)}
            placeholder="Опишите место, если точного адреса нет" />
        </label>
        <label className={styles.description}>Описание со слов заявителя
          <AutosizeTextarea required maxLength={1999} value={draft.description}
            onChange={(event) => change('description', event.target.value)} placeholder="Введите описание происшествия" />
          <span>{draft.description.length} / 1999</span>
        </label>
      </div>

      <div className={styles.incidentPanel}>
        <div className={styles.panelTitle}>Что случилось?</div>
        <IncidentSurvey cards={classifier} types={types} listId="incident-types" value={{
          type: draft.incident_code, sign2: draft.incident_sign_2, sign3: draft.incident_sign_3,
        }} onChange={(value) => setDraft((current) => ({ ...current,
          incident_code: value.type, incident_sign_2: value.sign2, incident_sign_3: value.sign3,
        }))} />
        {extraIncidents.map((item, index) => <IncidentSurvey key={index} cards={classifier}
          types={types} listId={`incident-type-${index}`} value={item}
          onChange={(value) => setExtraIncidents((current) => current.map((row, rowIndex) =>
            rowIndex === index ? value : row))}
          onRemove={() => setExtraIncidents((current) => current.filter((_, rowIndex) => rowIndex !== index))} />)}
        <button className={styles.addIncident} type="button" onClick={() => setExtraIncidents((current) =>
          [...current, { type: '', sign2: '', sign3: '' }])}>Добавить ещё тип происшествия</button>
        {classifierError && <div className={styles.modalError} role="alert">{classifierError}</div>}
        {error && !confirm && <div className={styles.modalError} role="alert">{error}</div>}
        <label className={styles.details}>Подробности происшествия
          <AutosizeTextarea required value={draft.incident_details}
            onChange={(event) => change('incident_details', event.target.value)}
            placeholder="Уточните обстоятельства, угрозы и необходимую помощь" />
        </label>
        <div className={styles.callState}><img src={helpIcon} alt="" /><span>{message}</span></div>
      </div>
    </form>

    <div className={styles.serviceBar}>
      <span>Службы:</span>
      <button className={styles.addService} type="button" onClick={() => setServicesOpen(true)}>
        <img src={plusIcon} alt="" />
      </button>
      <div className={styles.services}>{services.map((service) => <span key={service}>{service}</span>)}</div>
      <button className={styles.save} form="incident-card-form" disabled={saving}>Сохранить</button>
      <button className={styles.barIcon} type="button" onClick={onCancel} title="Закрыть карточку"><img src={closeIcon} alt="" /></button>
    </div>

    {servicesOpen && <ModalForm label="Службы на вызов" onClose={() => setServicesOpen(false)}>
      <div className={styles.modal}>
        <div className={styles.modalTitle}>Службы на вызов</div>
        <div className={styles.serviceChoices}>{serviceOptions.map((service) => <button type="button"
          className={services.includes(service) ? styles.serviceSelected : ''} key={service}
          onClick={() => toggleService(service)}>{service}</button>)}</div>
        <button className={styles.primary} type="button" onClick={() => setServicesOpen(false)}>Сохранить и закрыть</button>
      </div>
    </ModalForm>}

    {confirm && <ModalForm label="Подтверждение сохранения" onClose={() => { if (!saving) setConfirm(null); }}>
      <div className={styles.modal}>
        <div className={styles.modalTitle}>{confirm === 'save' ? 'Сохранить карточку?' : 'Завершить обработку вызова?'}</div>
        <div>{confirm === 'save' ? `Будут оповещены службы: ${services.join(', ') || 'не выбраны'}.`
          : `Карточка будет сохранена с признаком «${confirm === 'no-contact' ? 'Нет контакта' : 'Срыв звонка'}».`}</div>
        {error && <div className={styles.modalError} role="alert">{error}</div>}
        <div className={styles.modalActions}>
          <button className={styles.primary} type="button" disabled={saving} onClick={() => void save()}>
            {confirm === 'save' ? 'Оповестить и сохранить' : 'Сохранить карточку'}
          </button>
          <button type="button" disabled={saving} onClick={() => setConfirm(null)}>Вернуться к заполнению</button>
        </div>
      </div>
    </ModalForm>}
  </div>;
}
