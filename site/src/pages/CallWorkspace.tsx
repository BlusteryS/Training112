import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { User } from '../auth/api';
import { PhoneCard } from '../components/call/PhoneCard';
import { AddressLookup, type FiasAddress } from '../components/call/AddressLookup';
import { IncidentSurvey } from '../components/call/IncidentSurvey';
import { ToggleGroup } from '../components/call/ToggleGroup';
import { ModalForm } from '../components/ModalForm';
import { AutosizeTextarea } from '../components/ui/AutosizeTextarea';
import { api } from '../api';
import { moscowOkrugs } from '../incidentSources';
import hangupIcon from '../assets/call/hangup.svg';
import languageIcon from '../assets/call/language.svg';
import locationIcon from '../assets/call/location.svg';
import helpIcon from '../assets/call/help.svg';
import plusIcon from '../assets/workspace/plus.svg';
import closeIcon from '../assets/workspace/close.svg';
import { incidentClassifier, matchingCard, servicesForCard,
  type ClassifierCard } from './incidentClassifier';
import type { MapSelection } from '../components/call/IncidentMap';
import { additionalIncidents, elapsedParts, initialDraft, splitServices, type IncidentDraft } from './callDraft';
import styles from './CallWorkspace.module.css';

const IncidentMap = lazy(() => import('../components/call/IncidentMap')
  .then((module) => ({ default: module.IncidentMap })));

type LinkedCard = {
  id: string;
  incident: string;
  address: string;
  phone: string;
  matched: boolean;
};

export function CallWorkspace({ user, phone, elapsed, registeredAt, message, connected, initialCard, incidentNumber,
  attemptId, deadlineSeconds, saving, onEndCall, onCancel, onSave }: {
  user: User;
  phone: string;
  elapsed: number;
  registeredAt: number | null;
  message: string;
  connected: boolean;
  initialCard?: Record<string, string> | null;
  incidentNumber: string;
  attemptId: string;
  deadlineSeconds?: number | null;
  saving: boolean;
  onEndCall: () => void;
  onCancel: () => void;
  onSave: (draft: IncidentDraft, linkedTo: string | null) => Promise<void>;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(() => initialDraft(phone, initialCard));
  const [confirm, setConfirm] = useState<'save' | 'no-contact' | 'dropped' | null>(null);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [error, setError] = useState('');
  const [classifier, setClassifier] = useState<ClassifierCard[]>([]);
  const [classifierError, setClassifierError] = useState('');
  const [manualServices, setManualServices] = useState(() => splitServices(initialCard?.services ?? ''));
  const [excludedServices, setExcludedServices] = useState<string[]>([]);
  const [extraIncidents, setExtraIncidents] = useState(() => additionalIncidents(initialCard));
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkedTo, setLinkedTo] = useState<LinkedCard | null>(null);
  const [linkCandidates, setLinkCandidates] = useState<LinkedCard[]>([]);
  const [linkError, setLinkError] = useState('');
  const services = useMemo(() => splitServices(draft.services), [draft.services]);
  const types = useMemo(() => [...new Set(classifier.map((card) => card.type))].sort((a, b) => a.localeCompare(b, 'ru')),
    [classifier]);
  const selectedCard = useMemo(() => matchingCard(classifier, draft.incident_code,
    draft.incident_sign_2, draft.incident_sign_3, draft.classifier_code),
  [classifier, draft.incident_code, draft.incident_sign_2, draft.incident_sign_3, draft.classifier_code]);
  const selectedCards = useMemo(() => [selectedCard, ...extraIncidents.map((item) =>
    matchingCard(classifier, item.type, item.sign2, item.sign3, item.code))], [selectedCard, extraIncidents, classifier]);
  const suggestedServices = useMemo(() => [...new Set(selectedCards.flatMap((card) =>
    servicesForCard(card, draft.address, draft.district, draft.okrug, draft.victims,
      draft.law_violation === 'true')))],
  [selectedCards, draft.address, draft.district, draft.okrug, draft.victims, draft.law_violation]);
  const serviceOptions = useMemo(() => [...new Set(['101', '102', '103', '104',
    ...classifier.flatMap((card) => card.services),
    ...classifier.flatMap((card) => card.victim_services),
    ...classifier.flatMap((card) => card.law_services),
    ...suggestedServices, ...services])].sort((a, b) => a.localeCompare(b, 'ru')),
  [classifier, suggestedServices, services]);
  const time = elapsedParts(elapsed);
  const overdue = deadlineSeconds !== null && deadlineSeconds !== undefined && elapsed >= deadlineSeconds;
  const missingFields = [
    !draft.caller_name.trim() && 'ФИО заявителя',
    !draft.caller_status && 'Статус заявителя',
    !draft.address.trim() && 'Адрес происшествия',
    !draft.okrug && 'Округ',
    !draft.description.trim() && 'Описание со слов заявителя',
    !draft.incident_details.trim() && 'Подробности происшествия',
    selectedCards.some((card) => !card) && 'Тип и признаки происшествия',
    new Set(selectedCards.map((card) => card?.code)).size !== selectedCards.length
      && 'Повторяющийся тип происшествия',
    services.length === 0 && 'Службы для оповещения',
  ].filter((item): item is string => typeof item === 'string');

  useEffect(() => {
    let active = true;
    void incidentClassifier().then((cards) => { if (active) setClassifier(cards); })
      .catch(() => { if (active) setClassifierError('Не удалось открыть классификатор происшествий.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!attemptId || !phone.trim() && !draft.address.trim() && !linksOpen) {
      setLinkCandidates([]);
      setLinkError('');
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: linksOpen ? linkQuery : '', phone,
        address: draft.address.trim() });
      void api<LinkedCard[]>(`training/attempts/${attemptId}/link-candidates?${params}`,
        undefined, controller.signal)
        .then((cards) => {
          if (!controller.signal.aborted) {
            setLinkCandidates(linksOpen ? cards : cards.filter((card) => card.matched));
            setLinkError('');
          }
        }).catch((cause: unknown) => {
          if (!controller.signal.aborted)
            setLinkError(cause instanceof Error ? cause.message : 'Не удалось найти карточки.');
        });
    }, 350);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [attemptId, phone, draft.address, linksOpen, linkQuery]);

  useEffect(() => {
    const next = [...new Set([...suggestedServices.filter((service) => !excludedServices.includes(service)),
      ...manualServices])].join(', ');
    const all = JSON.stringify([{ type: draft.incident_code, sign2: draft.incident_sign_2,
      sign3: draft.incident_sign_3, code: selectedCard?.code ?? draft.classifier_code }, ...extraIncidents]);
    setDraft((current) => current.services === next && current.classifier_code === (selectedCard?.code ?? '')
      && current.incident_types === all ? current : { ...current, services: next,
        classifier_code: selectedCard?.code ?? '', incident_types: all });
  }, [suggestedServices, manualServices, excludedServices, selectedCard,
    draft.incident_code, draft.incident_sign_2, draft.incident_sign_3, extraIncidents]);

  useEffect(() => {
    const targets: Record<string, string> = {
      F1: 'card-aon', F2: 'card-provided-phone', F3: 'card-scene-phone',
      KeyK: 'card-channel', KeyQ: 'card-caller', KeyA: 'card-address',
      KeyP: 'card-victims', KeyN: 'card-no-contact', KeyT: 'incident-types-input',
      KeyR: 'incident-types-input', KeyO: 'card-description',
    };
    function onKeyDown(event: KeyboardEvent) {
      if (document.querySelector('[data-modal-form]')) return;
      if (event.key === 'Alt') { setShowShortcuts(true); return; }
      if (!event.altKey || event.shiftKey || event.metaKey) return;
      if (event.code === 'KeyS' && !event.ctrlKey) {
        event.preventDefault();
        pageRef.current?.querySelector<HTMLFormElement>('#incident-card-form')?.requestSubmit();
        return;
      }
      if (event.code === 'KeyZ' && !event.ctrlKey) {
        event.preventDefault();
        setServicesOpen(true);
        return;
      }
      const number = /^Digit([1-9])$/.exec(event.code)?.[1];
      const id = number && event.ctrlKey ? number === '1' ? 'incident-types-sign2'
        : number === '2' ? 'incident-types-sign3' : undefined
        : number ? number === '1' ? 'incident-types-input'
          : `incident-type-${Number(number) - 2}-input` : targets[event.code];
      if (!id || event.ctrlKey && !number) return;
      const target = pageRef.current?.querySelector<HTMLElement>(`#${id}`);
      if (!target) return;
      event.preventDefault();
      target.focus();
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === 'Alt') setShowShortcuts(false);
    }
    function onBlur() { setShowShortcuts(false); }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  function change<K extends keyof IncidentDraft>(key: K, value: IncidentDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setConfirm('save');
  }

  async function save() {
    if (confirm === 'save' && missingFields.length > 0) return;
    setError('');
    const reason = confirm === 'no-contact' ? 'Нет контакта с заявителем'
      : confirm === 'dropped' ? 'Срыв звонка' : '';
    const value = reason ? { ...draft, comment: reason, incident_code: reason,
      classifier_code: '', incident_types: '[]', incident_sign_2: '', incident_sign_3: '',
      services: '', description: reason } : draft;
    try {
      await onSave(value, linkedTo?.id ?? null);
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
  return <div ref={pageRef} className={`${styles.page} ${overdue ? styles.overdue : ''}`}>
    {showShortcuts && <div className={styles.shortcutHints}>
      <span>Alt+A — адрес</span><span>Alt+T — тип происшествия</span>
      <span>Alt+F2/F3 — телефоны</span><span>Alt+O — описание</span>
      <span>Alt+Z — службы</span><span>Alt+S — сохранить</span>
    </div>}
    <div className={styles.top}>
      <div className={styles.callControl}>
        <button type="button" onClick={onEndCall} disabled={!connected} title="Завершить звонок">
          <img src={hangupIcon} alt="" />
        </button>
      </div>
      <div className={styles.phoneGrid}>
        <PhoneCard id="card-aon" label="АОН" value={phone} foreign={draft.foreign_phone === 'true'}
          onForeignChange={(value) => change('foreign_phone', String(value))} />
        <PhoneCard id="card-provided-phone" label="Предоставленный номер" value={draft.provided_phone}
          onChange={(value) => change('provided_phone', value)} onCopy={() => change('provided_phone', phone)} />
        <PhoneCard id="card-scene-phone" label="Телефон на месте" value={draft.scene_phone}
          onChange={(value) => change('scene_phone', value)} onCopy={() => change('scene_phone', phone)} />
      </div>
      <div className={styles.incidentMeta}>
        <div className={styles.metaText}>
          <span className={styles.incidentName}>Происшествие {incidentNumber}</span>
          <span className={styles.metaLines}>
            {registered && <span>Зарег {registered}</span>}
            <span>Опер.{operatorNumber ? ` ${operatorNumber}` : ''}, АРМ {arm}</span>
          </span>
        </div>
      </div>
      <div className={styles.timer}>
        <span className={styles.timerValue}>{time.minutes}</span>
        <span className={styles.timerSeconds}>:{time.seconds}</span>
      </div>
    </div>

    <form id="incident-card-form" className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.callerRow}>
        <input id="card-caller" required value={draft.caller_name} onChange={(event) => change('caller_name', event.target.value)}
          placeholder="Заявитель" />
        <select required value={draft.caller_status} onChange={(event) => change('caller_status', event.target.value)}>
          <option value="">Статус заявителя</option>
          <option>Очевидец</option><option>Пострадавший</option><option>Родственник</option>
          <option>Знакомый</option><option>Ребёнок</option><option>Участник</option>
        </select>
        <select id="card-channel" value={draft.communication_channel}
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
      <div id="card-victims" tabIndex={-1} className={styles.victimsRow}>
        <div className={styles.caseFlag}>
          <span>Есть пострадавшие?</span>
          <ToggleGroup value={draft.victims === 'Нет' ? 'no'
            : draft.victims === 'Неизвестно' ? 'unknown' : 'yes'}
            options={[{ value: 'yes', label: 'Да' }, { value: 'no', label: 'Нет' },
              { value: 'unknown', label: 'Неизвестно' }] as const}
            onChange={(value) => change('victims', value === 'yes' ? '1'
              : value === 'no' ? 'Нет' : 'Неизвестно')} />
          {!['Нет', 'Неизвестно'].includes(draft.victims) && <input className={styles.count} min="1" type="number"
            value={draft.victims} onChange={(event) => change('victims', event.target.value)}
            aria-label="Количество пострадавших" />}
        </div>
        <div className={styles.caseFlag}>
          <span>Правонарушение?</span>
          <ToggleGroup value={draft.law_violation === 'true' ? 'yes' : 'no'}
            options={[{ value: 'yes', label: 'Да' }, { value: 'no', label: 'Нет' }] as const}
            onChange={(value) => change('law_violation', String(value === 'yes'))} />
        </div>
      </div>
      <div className={styles.quickActions}>
        <button type="button" onClick={() => setLinksOpen(true)}>
          {linkedTo ? 'Связь выбрана' : linkCandidates.length ? `Совпадение (${linkCandidates.length})` : 'Связать карточку'}
        </button>
        <button id="card-no-contact" type="button" onClick={() => setConfirm('no-contact')}>Нет контакта</button>
        <button type="button" onClick={() => setConfirm('dropped')}>Срыв звонка</button>
      </div>

      <div className={styles.caseColumns}>
      <div className={styles.leftColumn}>
      <div className={styles.addressPanel}>
        <div className={styles.panelTitle}>Адрес
          <button className={styles.mapButton} type="button" onClick={() => setMapOpen(true)}
            aria-label="Открыть карту" title="Открыть карту"><img src={locationIcon} alt="" /></button>
        </div>
        <AddressLookup value={draft.address} onChange={(value) => change('address', value)}
          onSelect={(address: FiasAddress) => setDraft((current) => ({ ...current,
            address: address.label, country: 'Россия', city: 'Москва',
            district: address.district, street: address.street, house: address.house }))} />
        {draft.location_lat && <div className={styles.mapPoint}>Точка на карте: {draft.location_lat}, {draft.location_lon}</div>}
        <div className={styles.addressGrid}>
          <label>Страна<input value={draft.country} onChange={(event) => change('country', event.target.value)} /></label>
          <label>Город<input value={draft.city} onChange={(event) => change('city', event.target.value)} /></label>
          <label>Объект<input value={draft.object} onChange={(event) => change('object', event.target.value)} /></label>
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
      </div>

      <div className={styles.descriptionPanel}>
        <label className={styles.description}>Описание со слов заявителя
          <AutosizeTextarea id="card-description" required maxLength={1999} value={draft.description}
            onChange={(event) => change('description', event.target.value)} placeholder="Введите описание происшествия" />
          <span>{draft.description.length} / 1999</span>
        </label>
      </div>
      </div>

      <div className={styles.incidentPanel}>
        <div className={styles.panelTitle}>Что случилось?</div>
        <IncidentSurvey cards={classifier} types={types} inputId="incident-types"
          listId="incident-lookup" value={{
          type: draft.incident_code, sign2: draft.incident_sign_2, sign3: draft.incident_sign_3,
          code: draft.classifier_code,
        }} onChange={(value) => setDraft((current) => ({ ...current,
          incident_code: value.type, incident_sign_2: value.sign2, incident_sign_3: value.sign3,
          classifier_code: value.code,
        }))} />
        {extraIncidents.map((item, index) => <IncidentSurvey key={index} cards={classifier}
          types={types} inputId={`incident-type-${index}`} listId="incident-lookup"
          showOptions={false} value={item}
          onChange={(value) => setExtraIncidents((current) => current.map((row, rowIndex) =>
            rowIndex === index ? value : row))}
          onRemove={() => setExtraIncidents((current) => current.filter((_, rowIndex) => rowIndex !== index))} />)}
        <button className={styles.addIncident} type="button" disabled={extraIncidents.length >= 29}
          onClick={() => setExtraIncidents((current) =>
          [...current, { type: '', sign2: '', sign3: '', code: '' }])}>Добавить ещё тип происшествия</button>
        {classifierError && <div className={styles.modalError} role="alert">{classifierError}</div>}
        {error && !confirm && <div className={styles.modalError} role="alert">{error}</div>}
        <label className={styles.details}>Подробности происшествия
          <AutosizeTextarea required value={draft.incident_details}
            onChange={(event) => change('incident_details', event.target.value)}
            placeholder="Уточните обстоятельства, угрозы и необходимую помощь" />
        </label>
        <div className={styles.callState}><img src={helpIcon} alt="" /><span>{message}</span></div>
      </div>
      </div>

      {mapOpen && <Suspense fallback={null}><IncidentMap latitude={draft.location_lat} longitude={draft.location_lon}
        onClose={() => setMapOpen(false)} onSelect={({ latitude, longitude, address }: MapSelection) => {
          setDraft((current) => ({ ...current,
            location_lat: latitude, location_lon: longitude,
            ...(address && { address: address.label, country: 'Россия', city: 'Москва',
              district: address.district || current.district, street: address.street, house: address.house }),
          }));
          setMapOpen(false);
        }} /></Suspense>}
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

    {linksOpen && <ModalForm label="Связать карточку" onClose={() => setLinksOpen(false)}>
      <div className={styles.modal}>
        <div className={styles.modalTitle}>Связь с существующим происшествием</div>
        <input className={styles.linkSearch} value={linkQuery}
          onChange={(event) => setLinkQuery(event.target.value)}
          placeholder="Поиск по номеру, адресу или типу происшествия" />
        {linkedTo && <div className={styles.linkRow}>
          <span>Выбрана карточка: {linkedTo.incident} · {linkedTo.address || linkedTo.phone}</span>
          <button type="button" onClick={() => setLinkedTo(null)}>Убрать связь</button>
        </div>}
        {linkError && <div className={styles.modalError} role="alert">{linkError}</div>}
        <div className={styles.linkList}>{linkCandidates.length ? linkCandidates.map((card) =>
          <button type="button" className={styles.linkRow} key={card.id}
            onClick={() => { setLinkedTo(card); setLinksOpen(false); }}>
            <span>{card.incident || 'Происшествие'} · {card.address || 'Адрес не указан'} · {card.phone}</span>
            {card.matched && <span>Совпадение</span>}
          </button>) : !linkError && <div>Карточки не найдены</div>}</div>
        <button className={styles.primary} type="button" onClick={() => setLinksOpen(false)}>Закрыть</button>
      </div>
    </ModalForm>}

    {confirm && <ModalForm label="Подтверждение сохранения" onClose={() => { if (!saving) setConfirm(null); }}>
      <div className={styles.modal}>
        <div className={styles.modalTitle}>{confirm === 'save' ? 'Сохранить карточку?' : 'Завершить обработку вызова?'}</div>
        <div>{confirm === 'save' ? `Будут оповещены службы: ${services.join(', ') || 'не выбраны'}.`
          : `Карточка будет сохранена с признаком «${confirm === 'no-contact' ? 'Нет контакта' : 'Срыв звонка'}».`}</div>
        {linkedTo && <div>Связать с карточкой: {linkedTo.incident} · {linkedTo.address || linkedTo.phone}</div>}
        {confirm === 'save' && missingFields.length > 0 && <div className={styles.missingFields}>
          <div>Заполните обязательные поля:</div>
          <ul>{missingFields.map((field) => <li key={field}>{field}</li>)}</ul>
        </div>}
        {error && <div className={styles.modalError} role="alert">{error}</div>}
        <div className={styles.modalActions}>
          <button className={styles.confirmAction} type="button" disabled={saving || confirm === 'save' && missingFields.length > 0}
            onClick={() => void save()}>
            {confirm === 'save' ? 'Оповестить и сохранить' : 'Сохранить карточку'}
          </button>
          <button className={styles.returnAction} type="button" disabled={saving}
            onClick={() => setConfirm(null)}>Вернуться к заполнению</button>
        </div>
      </div>
    </ModalForm>}
  </div>;
}
