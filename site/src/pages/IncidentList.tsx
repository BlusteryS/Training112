import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { WorkspaceSwitch } from '../components/WorkspaceSwitch';
import type { Assignment } from '../management/types';
import boltIcon from '../assets/workspace/bolt.svg';
import bookmarkIcon from '../assets/workspace/bookmark.svg';
import checkedIcon from '../assets/workspace/checked.svg';
import detailsIcon from '../assets/workspace/row-details.svg';
import expandIcon from '../assets/workspace/expand.svg';
import linkIcon from '../assets/workspace/link.svg';
import nextIcon from '../assets/workspace/next.svg';
import previousIcon from '../assets/workspace/previous.svg';
import separatorIcon from '../assets/workspace/separator.svg';
import timerIcon from '../assets/workspace/timer.svg';
import styles from './IncidentList.module.css';

const pageSizes = [10, 20, 50];

function assignmentStatus(assignment: Assignment) {
  if (assignment.attempt_status === 'completed') return 'Отработана';
  if (assignment.attempt_status === 'failed') return 'Ошибка';
  if (assignment.attempt_status) return 'В работе';
  return assignment.status === 'active' ? 'В очереди' : 'Закрыта';
}

function incidentType(assignment: Assignment) {
  return assignment.card?.incident_code?.trim() || assignment.title;
}

function shortNumber(id: string) {
  return id.replaceAll('-', '').slice(0, 8).toUpperCase();
}

function dateParts(value: string | null) {
  if (!value) return { date: '', time: '', stamp: '' };
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return { date: '', time: '', stamp: '' };
  return {
    date: new Intl.DateTimeFormat('ru-RU').format(date),
    time: new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date),
    stamp: new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(date).replace(',', ''),
  };
}

function operatorNumber(login: string) {
  return login.match(/\d+/)?.[0] ?? login;
}

function IncidentRow({ assignment }: { assignment: Assignment }) {
  const created = dateParts(assignment.created_at);
  const status = assignmentStatus(assignment);
  const description = assignment.instructions?.trim() || incidentType(assignment);
  const canOpen = ['created', 'active', 'suspended'].includes(assignment.attempt_status ?? '');
  return <div className={styles.row}>
    <div className={styles.rowMain}>
      {canOpen ? <Link className={styles.cellButton} title="Открыть текущую карточку"
          to={`/session?assignment_id=${encodeURIComponent(assignment.id)}`}>
          <img src={expandIcon} alt="" />
        </Link>
        : <div className={styles.iconCell}><img src={expandIcon} alt="" /></div>}
      <div className={styles.iconCell}><img src={linkIcon} alt="" /></div>
      <div className={styles.iconCell}><img src={bookmarkIcon} alt="" /></div>
      <div className={styles.iconCell}><img src={boltIcon} alt="" /></div>
      <div className={styles.iconCell}><img src={timerIcon} alt="" /></div>
      <div className={styles.cell}>{operatorNumber(assignment.learner_login)}</div>
      <div className={styles.cell}>{assignment.workstation ? assignment.workstation.padStart(3, '0') : ''}</div>
      <div className={styles.cell}>{shortNumber(assignment.id)}</div>
      <div className={styles.cell}>{created.date}</div>
      <div className={`${styles.cell} ${styles.darkCell}`}>{created.time}</div>
      <div className={`${styles.cell} ${styles.darkCell}`}>{incidentType(assignment)}</div>
      <div className={styles.cell}>{assignment.card?.victims ?? ''}</div>
      <div className={`${styles.cell} ${styles.statusCell}`}>{status}</div>
      <div className={`${styles.cell} ${styles.darkCell}`}>{assignment.card?.address ?? ''}</div>
      <div className={styles.iconCell}><img src={detailsIcon} alt="" /></div>
      <div className={styles.checkedCell}>{status === 'Отработана' && <img src={checkedIcon} alt="Проверено" />}</div>
    </div>
    <div className={styles.description}>
      <span>Описание:</span>
      <span className={styles.descriptionMeta}>{created.stamp} Опер. {operatorNumber(assignment.learner_login)}</span>
      <img src={separatorIcon} alt="" />
      <span>{description} /112</span>
    </div>
  </div>;
}

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

function same(left: string, right: string) {
  return left.trim().toLocaleLowerCase('ru') === right.trim().toLocaleLowerCase('ru');
}

function parts(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function contains(query: string, values: Array<string | null | undefined>) {
  const needle = query.trim().toLocaleLowerCase('ru');
  return !needle || values.some((value) => (value ?? '').toLocaleLowerCase('ru').includes(needle));
}

function equals(query: string, value: string | null | undefined) {
  const needle = query.trim().toLocaleLowerCase('ru');
  return !needle || same(needle, value ?? '');
}

function oneOf(query: string, values: Array<string | null | undefined>) {
  const wanted = parts(query);
  if (!wanted.length) return true;
  const have = values.flatMap((value) => parts(value ?? ''));
  return wanted.some((part) => have.some((value) => same(part, value)));
}

function armKey(value: string) {
  const text = value.trim();
  return /^\d{1,4}$/.test(text) ? String(Number(text)) : '';
}

function armMatch(query: string, stored: string | null) {
  const wanted = parts(query);
  if (!wanted.length) return true;
  const desk = stored ? armKey(stored) : '';
  return Boolean(desk) && wanted.some((part) => armKey(part) === desk);
}

function operatorMatch(query: string, login: string) {
  const needle = query.trim().toLocaleLowerCase('ru');
  if (!needle) return true;
  const number = (login.match(/\d+/)?.[0] ?? login).toLocaleLowerCase('ru');
  return needle === login.toLocaleLowerCase('ru') || needle === number;
}

export function IncidentList({ assignments, autoRefresh, filter, loading, onAutoRefresh, search }: {
  assignments: Assignment[];
  autoRefresh: boolean;
  filter: string;
  loading: boolean;
  onAutoRefresh: (value: boolean) => void;
  search: IncidentSearch;
}) {
  const [status, setStatus] = useState('');
  const [group, setGroup] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const groups = useMemo(() => [...new Set(assignments.map((item) => item.group_name))].sort(), [assignments]);
  const needle = filter.trim().toLocaleLowerCase('ru');
  const filtered = assignments.filter((assignment) => {
    const card = assignment.card;
    const created = assignment.created_at ? new Date(assignment.created_at).valueOf() : Number.NaN;
    const searchable = [assignment.title, assignment.group_name, assignment.learner_login,
      card?.incident_code, card?.address, card?.description, assignment.instructions]
      .filter(Boolean).join(' ').toLocaleLowerCase('ru');
    return assignment.mode === 'call' && Boolean(assignment.attempt_status)
      && (!needle || searchable.includes(needle))
      && (search.from === null || (!Number.isNaN(search.from) && !Number.isNaN(created) && created >= search.from))
      && (search.to === null || (!Number.isNaN(search.to) && !Number.isNaN(created) && created <= search.to))
      && contains(search.incident, [incidentType(assignment)])
      && contains(search.signs, [card?.incident_sign_2, card?.incident_sign_3])
      && contains(search.address, [card?.address, card?.street, card?.house])
      && oneOf(search.okrug, [card?.okrug])
      && equals(search.district, card?.district)
      && equals(search.region, card?.city)
      && contains(search.caller, [card?.caller_name, card?.phone, assignment.caller_phone])
      && operatorMatch(search.operator, assignment.learner_login)
      && armMatch(search.arm, assignment.workstation)
      && contains(search.descriptiveAddress, [card?.address_description])
      && oneOf(search.service, [card?.services])
      && contains(search.description, [card?.description])
      && oneOf(search.channel, [card?.communication_channel])
      && oneOf(search.source, [assignment.incident_source])
      && oneOf(search.status, [assignmentStatus(assignment)])
      && contains(search.cardNumber, [assignment.id, shortNumber(assignment.id)])
      && equals(search.visOperator, assignment.vis_operator)
      && (!status || assignmentStatus(assignment) === status)
      && (!group || assignment.group_name === group);
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const first = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
  const last = Math.min(currentPage * pageSize, filtered.length);

  useEffect(() => setPage(1), [filter, group, pageSize, search, status]);

  if (loading) return null;

  return <div className={styles.board} id="incident-list">
    <div className={styles.toolbar}>
      <div className={styles.title}>Список происшествий</div>
      <div className={styles.controls}>
        <WorkspaceSwitch checked={autoRefresh} onChange={onAutoRefresh}>Автообновление</WorkspaceSwitch>
        <label className={styles.selectControl}>
          <span className={styles.visuallyHidden}>Что показать</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Выберите, что показать</option>
            <option value="В работе">В работе</option>
            <option value="Отработана">Отработанные</option>
            <option value="Ошибка">С ошибкой</option>
          </select>
        </label>
      </div>
    </div>

    {!rows.length ? <div className={styles.empty}>Происшествия не найдены</div> : <>
      <div className={styles.tableViewport}>
      <div className={styles.table}>
        <div className={styles.tableHead}>
          <span /><span>Связи</span><span /><span>ЧС</span><span />
          <span>Опер.</span><span>АРМ</span><span>Номер</span><span>Дата</span><span>Время</span>
          <span>Тип происшествия</span><span>Постр.</span><span>Статус</span><span>Адрес</span><span /><span>Проверено</span>
        </div>
        <div className={styles.rows}>
          {rows.map((assignment) => <IncidentRow assignment={assignment} key={assignment.id} />)}
        </div>
      </div>
    </div>

    <div className={styles.footer}>
      <label className={styles.footerSelect}>
        <span className={styles.visuallyHidden}>Группа</span>
        <select value={group} onChange={(event) => setGroup(event.target.value)}>
          <option value="">Выберите группу</option>
          {groups.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <div className={styles.pagination}>
        <label>
          <span className={styles.visuallyHidden}>Страница</span>
          <select value={currentPage} onChange={(event) => setPage(Number(event.target.value))}>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) =>
              <option key={number} value={number}>Страница: {number}</option>)}
          </select>
        </label>
        <label>
          <span className={styles.visuallyHidden}>Записей на странице</span>
          <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            {pageSizes.map((size) => <option key={size} value={size}>Записей на странице: {size}</option>)}
          </select>
        </label>
        <span>{first}-{last} из {filtered.length}</span>
        <div className={styles.pageButtons}>
          <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} title="Предыдущая страница">
            <img src={previousIcon} alt="" />
          </button>
          <button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} title="Следующая страница">
            <img src={nextIcon} alt="" />
          </button>
        </div>
      </div>
    </div>
    </>}
  </div>;
}
