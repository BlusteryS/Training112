import { useMemo, useState, type FormEvent } from 'react';
import type { User } from '../auth/api';
import { PhoneCard } from '../components/call/PhoneCard';
import { ToggleGroup } from '../components/call/ToggleGroup';
import hangupIcon from '../assets/call/hangup.svg';
import languageIcon from '../assets/call/language.svg';
import locationIcon from '../assets/call/location.svg';
import helpIcon from '../assets/call/help.svg';
import plusIcon from '../assets/workspace/plus.svg';
import closeIcon from '../assets/workspace/close.svg';
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
  incident_details: string;
  address: string;
  country: string;
  city: string;
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

const serviceOptions = ['101', '102', '103', '104', 'ДДС района'];
const incidentOptions = [
  { title: 'Пожар или задымление', services: ['101', '102', '103'] },
  { title: 'Дорожно-транспортное происшествие', services: ['101', '102', '103'] },
  { title: 'Требуется медицинская помощь', services: ['103'] },
  { title: 'Нарушение общественного порядка', services: ['102'] },
  { title: 'Запах газа или авария газового оборудования', services: ['101', '104'] },
  { title: 'Авария коммунальных сетей', services: ['ДДС района'] },
] as const;

function initialDraft(phone: string, card?: Record<string, string> | null): IncidentDraft {
  return {
    phone, provided_phone: '', scene_phone: '', communication_channel: 'Мобильный телефон',
    foreign_phone: 'false', caller_name: '', caller_status: '', foreign_language: 'false',
    incident_code: '', incident_details: '', address: '', country: 'Россия', city: 'Москва',
    district: '', street: '', house: '', entrance: '', floor: '', description: '', victims: 'Нет',
    services: '', comment: '', ...card,
  };
}

function splitServices(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function elapsedParts(seconds: number) {
  return {
    minutes: Math.floor(seconds / 60).toString().padStart(2, '0'),
    seconds: (seconds % 60).toString().padStart(2, '0'),
  };
}

export function CallWorkspace({ user, phone, elapsed, message, connected, initialCard, incidentNumber,
  saving, onEndCall, onCancel, onSave }: {
  user: User;
  phone: string;
  elapsed: number;
  message: string;
  connected: boolean;
  initialCard?: Record<string, string> | null;
  incidentNumber: string;
  saving: boolean;
  onEndCall: () => void;
  onCancel: () => void;
  onSave: (draft: IncidentDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => initialDraft(phone, initialCard));
  const [confirm, setConfirm] = useState<'save' | 'no-contact' | 'dropped' | null>(null);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [error, setError] = useState('');
  const services = useMemo(() => splitServices(draft.services), [draft.services]);
  const time = elapsedParts(elapsed);

  function change<K extends keyof IncidentDraft>(key: K, value: IncidentDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function selectIncident(value: string) {
    const matched = incidentOptions.find(({ title }) => title === value);
    setDraft((current) => ({ ...current, incident_code: value,
      services: matched ? matched.services.join(', ') : current.services,
    }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setConfirm('save');
  }

  async function save() {
    setError('');
    const reason = confirm === 'no-contact' ? 'Нет контакта с заявителем'
      : confirm === 'dropped' ? 'Срыв звонка' : '';
    const value = reason ? { ...draft, comment: reason, incident_code: draft.incident_code || reason,
      description: draft.description || reason } : draft;
    try {
      await onSave(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить карточку.');
    }
  }

  function toggleService(service: string) {
    const next = services.includes(service) ? services.filter((item) => item !== service) : [...services, service];
    change('services', next.join(', '));
  }

  return <div className={styles.page}>
    <div className={styles.top}>
      <div className={styles.callControl}>
        <button type="button" onClick={onEndCall} disabled={!connected} title="Завершить звонок">
          <img src={hangupIcon} alt="" />
        </button>
      </div>
      <div className={styles.telephony}>
        <div className={styles.connection}>{connected ? 'Подключен' : 'Разговор завершён'}</div>
        <label className={styles.channel}>
          <select value={draft.communication_channel}
            onChange={(event) => change('communication_channel', event.target.value)}>
            <option>Мобильный телефон</option>
            <option>Стационарный телефон</option>
            <option>Устройство без SIM-карты</option>
          </select>
        </label>
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
          <span>Время<br />решения</span>
          <strong>{time.minutes}</strong><small>:{time.seconds}</small>
        </div>
        <div className={styles.metaText}>
          <strong>Происшествие {incidentNumber}</strong>
          <span>Опер. {user.login}, АРМ {(user.workstation ?? '000').padStart(3, '0')}</span>
        </div>
      </div>
    </div>

    <form id="incident-card-form" className={styles.form} onSubmit={submit}>
      <div className={styles.callerRow}>
        <input required value={draft.caller_name} onChange={(event) => change('caller_name', event.target.value)}
          placeholder="Фамилия и имя заявителя" />
        <select required value={draft.caller_status} onChange={(event) => change('caller_status', event.target.value)}>
          <option value="">Выберите статус</option>
          <option>Очевидец</option><option>Пострадавший</option><option>Родственник</option>
          <option>Знакомый</option><option>Ребёнок</option><option>Участник</option>
        </select>
        <button className={draft.foreign_language === 'true' ? styles.iconSelected : styles.iconButton}
          type="button" onClick={() => change('foreign_language', String(draft.foreign_language !== 'true'))}
          title="Вызов на иностранном языке"><img src={languageIcon} alt="" /></button>
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
          placeholder="Введите адрес с номером дома" />
        <div className={styles.addressGrid}>
          <label>Страна<input value={draft.country} onChange={(event) => change('country', event.target.value)} /></label>
          <label>Город<input value={draft.city} onChange={(event) => change('city', event.target.value)} /></label>
          <label>Район<input value={draft.district} onChange={(event) => change('district', event.target.value)} /></label>
          <label>Улица<input value={draft.street} onChange={(event) => change('street', event.target.value)} /></label>
          <label>Дом<input value={draft.house} onChange={(event) => change('house', event.target.value)} /></label>
          <label>Подъезд<input value={draft.entrance} onChange={(event) => change('entrance', event.target.value)} /></label>
          <label>Этаж<input value={draft.floor} onChange={(event) => change('floor', event.target.value)} /></label>
        </div>
        <label className={styles.description}>Описание со слов заявителя
          <textarea required maxLength={1999} value={draft.description}
            onChange={(event) => change('description', event.target.value)} placeholder="Введите описание происшествия" />
          <span>{draft.description.length} / 1999</span>
        </label>
      </div>

      <div className={styles.incidentPanel}>
        <div className={styles.panelTitle}>Что случилось?</div>
        <input required list="incident-types" value={draft.incident_code}
          onChange={(event) => selectIncident(event.target.value)} placeholder="Добавить тип происшествия" />
        <datalist id="incident-types">{incidentOptions.map(({ title }) => <option key={title} value={title} />)}</datalist>
        {draft.incident_code && <div className={styles.chips}><button type="button"
          onClick={() => selectIncident('')}>{draft.incident_code} ×</button></div>}
        <label className={styles.details}>Подробности происшествия
          <textarea required value={draft.incident_details}
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

    {servicesOpen && <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Службы на вызов">
      <div className={styles.modal}>
        <div className={styles.modalTitle}>Службы на вызов</div>
        <div className={styles.serviceChoices}>{serviceOptions.map((service) => <button type="button"
          className={services.includes(service) ? styles.serviceSelected : ''} key={service}
          onClick={() => toggleService(service)}>{service}</button>)}</div>
        <button className={styles.primary} type="button" onClick={() => setServicesOpen(false)}>Сохранить и закрыть</button>
      </div>
    </div>}

    {confirm && <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Подтверждение сохранения">
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
    </div>}
  </div>;
}
