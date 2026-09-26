import type { ChangeEvent, RefObject } from 'react';
import { ActionButton, ActionRow } from '../components/ui/ActionButton';
import { TextField } from '../components/ui/TextField';
import searchClockIcon from '../assets/workspace/search-clock.svg';
import searchPlusIcon from '../assets/workspace/search-plus.svg';
import styles from './IncidentSearch.module.css';

type DateParts = { hh: string; mm: string; dd: string; mo: string; yyyy: string };

export type IncidentSearch = {
  from: number | null;
  to: number | null;
  incident: string;
  signs: string;
  address: string;
  okrug: string;
  district: string;
  region: string;
  caller: string;
  operator: string;
  arm: string;
  descriptiveAddress: string;
  service: string;
  description: string;
  channel: string;
  source: string;
  status: string;
  cardNumber: string;
  visOperator: string;
};

export type SearchDraft = Omit<IncidentSearch, 'from' | 'to'> & {
  from: DateParts;
  to: DateParts;
};

const blankDate = (): DateParts => ({ hh: '', mm: '', dd: '', mo: '', yyyy: '' });

export function blankSearch(): SearchDraft {
  return {
    from: blankDate(), to: blankDate(),
    incident: '', signs: '', address: '', okrug: '', district: '', region: '',
    caller: '', operator: '', arm: '', descriptiveAddress: '', service: '',
    description: '', channel: '', source: '', status: '', cardNumber: '', visOperator: '',
  };
}

function dateBound(parts: DateParts, end: boolean) {
  if (!Object.values(parts).some(Boolean)) return null;
  const year = Number(parts.yyyy);
  const month = Number(parts.mo);
  const day = Number(parts.dd);
  const hours = parts.hh === '' ? (end ? 23 : 0) : Number(parts.hh);
  const minutes = parts.mm === '' ? (end ? 59 : 0) : Number(parts.mm);
  if (![year, month, day, hours, minutes].every(Number.isInteger)) return Number.NaN;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hours > 23 || minutes > 59 || year < 1) return Number.NaN;
  const date = new Date(year, month - 1, day, hours, minutes, end ? 59 : 0, end ? 999 : 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return Number.NaN;
  return date.valueOf();
}

export function searchFilter(draft: SearchDraft): IncidentSearch {
  return { ...draft, from: dateBound(draft.from, false), to: dateBound(draft.to, true) };
}

function DateBound({ label, value, onChange }: {
  label: string;
  value: DateParts;
  onChange: (next: DateParts) => void;
}) {
  const change = (key: keyof DateParts, max: number) => (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, [key]: event.target.value.replace(/\D/g, '').slice(0, max) });
  };
  return <div className={styles.dateBound}>
    <div className={styles.dateCluster}>
      <input aria-label={`${label}, часы`} className={styles.digit2} inputMode="numeric" value={value.hh} onChange={change('hh', 2)} />
      <span className={styles.dateSep}>:</span>
      <input aria-label={`${label}, минуты`} className={styles.digit2} inputMode="numeric" value={value.mm} onChange={change('mm', 2)} />
      <img src={searchClockIcon} alt="" />
    </div>
    <div className={styles.dateCluster}>
      <input aria-label={`${label}, день`} className={styles.digit2} inputMode="numeric" value={value.dd} onChange={change('dd', 2)} />
      <span className={styles.dateSep}>.</span>
      <input aria-label={`${label}, месяц`} className={styles.digit2} inputMode="numeric" value={value.mo} onChange={change('mo', 2)} />
      <span className={styles.dateSep}>.</span>
      <input aria-label={`${label}, год`} className={styles.digit4} inputMode="numeric" value={value.yyyy} onChange={change('yyyy', 4)} />
      <img src={searchClockIcon} alt="" />
    </div>
  </div>;
}

export function AdvancedIncidentSearch({ formRef, draft, onChange, onApply, onReset }: {
  formRef: RefObject<HTMLFormElement | null>;
  draft: SearchDraft;
  onChange: (patch: Partial<SearchDraft>) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  return <form ref={formRef} className={styles.advancedSearch}
    onSubmit={(event) => { event.preventDefault(); onApply(); }}>
    <div className={styles.dateRow}>
      <div>Искать по времени и дате:</div>
      <div className={styles.dateRange}>
        <DateBound label="Начало" value={draft.from} onChange={(from) => onChange({ from })} />
        <span className={styles.dateDash}>—</span>
        <DateBound label="Конец" value={draft.to} onChange={(to) => onChange({ to })} />
      </div>
    </div>
    <div className={styles.advancedGrid}>
      <TextField label="Тип происшествия" placeholder="Тип происшествия" value={draft.incident}
        onChange={(incident) => onChange({ incident })} />
      <TextField label="Признаки происшествия:" value={draft.signs}
        onChange={(signs) => onChange({ signs })} />
      <TextField label="По адресу:" value={draft.address}
        onChange={(address) => onChange({ address })} />
      <TextField label="По округу:" value={draft.okrug}
        onChange={(okrug) => onChange({ okrug })} />
      <TextField label="По району:" value={draft.district}
        onChange={(district) => onChange({ district })} />
      <TextField label="По субъекту:" placeholder="По субъекту" value={draft.region}
        onChange={(region) => onChange({ region })} />
      <TextField label="По заявителю (ФИО/АОН):" value={draft.caller}
        onChange={(caller) => onChange({ caller })} />
      <TextField label="По оператору:" value={draft.operator}
        onChange={(operator) => onChange({ operator })} />
      <TextField label="По АРМу:" placeholder="По АРМу" value={draft.arm}
        onChange={(arm) => onChange({ arm })} />
      <TextField label="По описательному адресу:" value={draft.descriptiveAddress}
        onChange={(descriptiveAddress) => onChange({ descriptiveAddress })} />
      <TextField label="По службе:" placeholder="По службе" value={draft.service}
        onChange={(service) => onChange({ service })} />
      <TextField label="По описанию:" value={draft.description}
        onChange={(description) => onChange({ description })} />
      <TextField label="Канал связи:" placeholder="Канал связи" value={draft.channel}
        onChange={(channel) => onChange({ channel })} />
      <TextField label="Источник происшествия:" placeholder="Источник происшествия" value={draft.source}
        onChange={(source) => onChange({ source })} />
      <TextField label="Статус:" placeholder="Статус" value={draft.status}
        onChange={(status) => onChange({ status })} />
      <TextField label="По номеру карточки:" value={draft.cardNumber}
        onChange={(cardNumber) => onChange({ cardNumber })} />
      <TextField wide label="По оператору, работавшему с КП из ВИС:" value={draft.visOperator}
        onChange={(visOperator) => onChange({ visOperator })} />
    </div>
    <ActionRow>
      <ActionButton type="submit"><img src={searchPlusIcon} alt="" /> Искать по параметрам</ActionButton>
      <ActionButton onClick={onReset}><img src={searchPlusIcon} alt="" /> Сбросить</ActionButton>
    </ActionRow>
  </form>;
}
