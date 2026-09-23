import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { User } from '../auth/api';
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

function IncidentRow({ assignment, workstation }: { assignment: Assignment; workstation: string }) {
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
      <div className={styles.cell}>{workstation}</div>
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

export function IncidentList({ addressFilter, assignments, autoRefresh, filter, incidentFilter,
  loading, onAutoRefresh, user }: {
  addressFilter: string;
  assignments: Assignment[];
  autoRefresh: boolean;
  filter: string;
  incidentFilter: string;
  loading: boolean;
  onAutoRefresh: (value: boolean) => void;
  user: User;
}) {
  const [status, setStatus] = useState('');
  const [group, setGroup] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const groups = useMemo(() => [...new Set(assignments.map((item) => item.group_name))].sort(), [assignments]);
  const needle = filter.trim().toLocaleLowerCase('ru');
  const addressNeedle = addressFilter.trim().toLocaleLowerCase('ru');
  const incidentNeedle = incidentFilter.trim().toLocaleLowerCase('ru');
  const filtered = assignments.filter((assignment) => {
    const searchable = [assignment.title, assignment.group_name, assignment.learner_login,
      assignment.card?.incident_code, assignment.card?.address, assignment.card?.description,
      assignment.instructions].filter(Boolean).join(' ').toLocaleLowerCase('ru');
    return assignment.mode === 'call' && Boolean(assignment.attempt_status)
      && (!needle || searchable.includes(needle))
      && (!addressNeedle || (assignment.card?.address ?? '').toLocaleLowerCase('ru').includes(addressNeedle))
      && (!incidentNeedle || incidentType(assignment).toLocaleLowerCase('ru').includes(incidentNeedle))
      && (!status || assignmentStatus(assignment) === status)
      && (!group || assignment.group_name === group);
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const first = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
  const last = Math.min(currentPage * pageSize, filtered.length);

  useEffect(() => setPage(1), [addressFilter, filter, group, incidentFilter, pageSize, status]);

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
          {rows.map((assignment) => <IncidentRow assignment={assignment} key={assignment.id}
            workstation={user.workstation ?? '000'} />)}
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
