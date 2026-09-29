import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChoiceSelect } from '../components/ChoiceSelect';
import { EvaluationDetails, type Evaluation } from '../components/EvaluationDetails';
import { ModalForm } from '../components/ModalForm';
import { WorkspaceSwitch } from '../components/WorkspaceSwitch';
import { api } from '../api';
import type { Assignment } from '../management/types';
import { TableGrid, TableRow } from '../management/Table';
import type { IncidentSearch } from './IncidentSearch';
import { ddsStatusNames } from '../components/dds/statuses';
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
type MarkerKind = 'pinned' | 'emergency';
type IncidentMarkers = Record<MarkerKind, string[]>;

function readMarkers(userId: string): IncidentMarkers {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(`incident-markers:${userId}`) ?? 'null');
    if (stored && typeof stored === 'object') {
      const value = stored as Record<string, unknown>;
      return {
        pinned: Array.isArray(value.pinned) ? value.pinned.filter((id): id is string => typeof id === 'string') : [],
        emergency: Array.isArray(value.emergency) ? value.emergency.filter((id): id is string => typeof id === 'string') : [],
      };
    }
  } catch { /* Недоступно хранилище браузера. */ }
  return { pinned: [], emergency: [] };
}
const dateFormatter = new Intl.DateTimeFormat('ru-RU');
const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit', minute: '2-digit', hour12: false,
});
const stampFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

function assignmentStatus(assignment: Assignment) {
  if (assignment.attempt_status === 'completed') return 'Отработана';
  if (assignment.attempt_status === 'failed') return 'Прервано';
  if (assignment.attempt_status) return 'В работе';
  return assignment.status === 'active' ? 'В очереди' : 'Закрыта';
}

function rowStatus(assignment: Assignment) {
  if (assignment.mode !== 'card' || assignment.attempt_status !== 'active') return assignmentStatus(assignment);
  if (assignment.card_status === 'added' && assignment.attempt_started_at
      && Date.now() - new Date(assignment.attempt_started_at).valueOf() > 30_000) return 'Не оповещено';
  return ddsStatusNames[assignment.card_status ?? ''] ?? 'В работе';
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
    date: dateFormatter.format(date),
    time: timeFormatter.format(date),
    stamp: stampFormatter.format(date).replace(',', ''),
  };
}

function operatorNumber(login: string) {
  return login.match(/\d+/)?.[0] ?? login;
}

function IncidentRow({ assignment, pinned, emergency, onToggleMarker, onViewTimer, onViewResult, onViewLinks }: {
  assignment: Assignment;
  pinned: boolean;
  emergency: boolean;
  onToggleMarker: (id: string, kind: MarkerKind) => void;
  onViewTimer: (assignment: Assignment) => void;
  onViewResult: (assignment: Assignment) => void;
  onViewLinks: (assignment: Assignment) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const created = dateParts(assignment.created_at);
  const status = assignmentStatus(assignment);
  const description = assignment.instructions?.trim() || incidentType(assignment);
  const canOpen = assignment.mode === 'card'
    ? assignment.status === 'active' && !['completed', 'failed'].includes(assignment.attempt_status ?? '')
    : ['created', 'active', 'suspended'].includes(assignment.attempt_status ?? '');
  const openPath = assignment.mode === 'card' ? '/card' : '/session';
  const cardPath = `${openPath}?assignment_id=${encodeURIComponent(assignment.id)}`;
  return <div className={styles.row}>
    <TableRow plain className={[styles.rowMain, expanded ? '' : styles.rowCollapsed,
      emergency ? styles.emergencyRow : ''].filter(Boolean).join(' ')}>
      <button type="button" className={styles.cellButton} aria-expanded={expanded}
        title={expanded ? 'Свернуть описание' : 'Развернуть описание'}
        onClick={() => setExpanded((value) => !value)}>
        <img className={expanded ? '' : styles.expandClosed} src={expandIcon} alt="" />
      </button>
      {assignment.mode === 'call' && assignment.attempt_id && assignment.attempt_status === 'completed'
        ? <button type="button" className={styles.cellButton} title="Связи карточки"
          onClick={() => onViewLinks(assignment)}><img src={linkIcon} alt="" />
          {!!assignment.link_count && <span className={styles.linkCount}>{assignment.link_count}</span>}
        </button>
        : <div className={styles.iconCell} title={assignment.mode === 'card'
          ? 'Связи доступны для карточек оператора 112'
          : 'Связать карточку можно после её сохранения'}>—</div>}
      <button type="button" className={`${styles.cellButton} ${pinned ? styles.markedButton : ''}`}
        aria-pressed={pinned} title={pinned ? 'Открепить происшествие' : 'Закрепить происшествие'}
        onClick={() => onToggleMarker(assignment.id, 'pinned')}><img src={bookmarkIcon} alt="" /></button>
      <button type="button" className={`${styles.cellButton} ${emergency ? styles.markedButton : ''}`}
        aria-pressed={emergency} title={emergency ? 'Снять личную пометку ЧС' : 'Лично пометить как ЧС'}
        onClick={() => onToggleMarker(assignment.id, 'emergency')}><img src={boltIcon} alt="" /></button>
      <button type="button" className={styles.cellButton} title="Время происшествия и норматив"
        onClick={() => onViewTimer(assignment)}><img src={timerIcon} alt="" /></button>
      <div className={styles.cell}>{operatorNumber(assignment.learner_login)}</div>
      <div className={styles.cell}>{assignment.workstation ? assignment.workstation.padStart(3, '0') : ''}</div>
      <div className={styles.cell}>{canOpen
        ? <Link className={styles.cardLink} title="Открыть карточку" to={cardPath}>{shortNumber(assignment.id)}</Link>
        : shortNumber(assignment.id)}</div>
      <div className={styles.cell}>{created.date}</div>
      <div className={`${styles.cell} ${styles.darkCell}`}>{created.time}</div>
      <div className={`${styles.cell} ${styles.darkCell}`}>{incidentType(assignment)}</div>
      <div className={styles.cell}>{assignment.card?.victims ?? ''}</div>
      <div className={`${styles.cell} ${styles.darkCell}`}>{assignment.card?.address ?? ''}</div>
      <div className={`${styles.cell} ${styles.statusCell}`}>{rowStatus(assignment)}</div>
      {assignment.attempt_id && ['completed', 'failed'].includes(assignment.attempt_status ?? '')
        ? <button type="button" className={styles.cellButton} title="Посмотреть результат"
          onClick={() => onViewResult(assignment)}><img src={detailsIcon} alt="" /></button>
        : <div className={styles.iconCell} />}
      <div className={styles.checkedCell}>{status === 'Отработана' && <img src={checkedIcon} alt="Проверено" />}</div>
    </TableRow>
    {expanded && <div className={styles.description}>
      <span>Описание:</span>
      <span className={styles.descriptionMeta}>{created.stamp} {assignment.mode === 'card' ? 'ДДС' : 'Опер.'} {operatorNumber(assignment.learner_login)}</span>
      <img src={separatorIcon} alt="" />
      <span>{description} /112</span>
    </div>}
  </div>;
}

type LinkedCard = {
  id: string;
  main?: boolean;
  matched?: boolean;
  incident: string;
  address: string;
  phone: string;
  created_at: string;
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

export function IncidentList({ assignments, autoRefresh, filter, loading, moduleId, moduleOptions, userId, now,
  onAutoRefresh, onModuleChange, search }: {
  assignments: Assignment[];
  autoRefresh: boolean;
  filter: string;
  loading: boolean;
  moduleId: string;
  moduleOptions: [string, string][];
  userId: string;
  now: number;
  onAutoRefresh: (value: boolean) => void;
  onModuleChange: (value: string) => void;
  search: IncidentSearch;
}) {
  const [status, setStatus] = useState('');
  const [group, setGroup] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [resultAssignment, setResultAssignment] = useState<Assignment | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [resultError, setResultError] = useState('');
  const resultRequest = useRef<AbortController | null>(null);
  const [linkAssignment, setLinkAssignment] = useState<Assignment | null>(null);
  const [links, setLinks] = useState<LinkedCard[]>([]);
  const [candidates, setCandidates] = useState<LinkedCard[]>([]);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkError, setLinkError] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkReload, setLinkReload] = useState(0);
  const [timerId, setTimerId] = useState('');
  const [markers, setMarkers] = useState(() => readMarkers(userId));
  useEffect(() => {
    try { localStorage.setItem(`incident-markers:${userId}`, JSON.stringify(markers)); }
    catch { /* Пометки останутся до закрытия страницы. */ }
  }, [markers, userId]);
  const pinned = useMemo(() => new Set(markers.pinned), [markers.pinned]);
  const emergency = useMemo(() => new Set(markers.emergency), [markers.emergency]);
  const timerAssignment = assignments.find((item) => item.id === timerId);
  function toggleMarker(id: string, kind: MarkerKind) {
    setMarkers((current) => ({ ...current, [kind]: current[kind].includes(id)
      ? current[kind].filter((item) => item !== id) : [...current[kind], id] }));
  }
  const groups = useMemo(() => [...new Set(assignments.map((item) => item.group_name))].sort(), [assignments]);
  const needle = filter.trim().toLocaleLowerCase('ru');
  const filtered = useMemo(() => assignments.filter((assignment) => {
    const card = assignment.card;
    const created = assignment.created_at ? new Date(assignment.created_at).valueOf() : Number.NaN;
    const searchable = [assignment.title, assignment.group_name, assignment.learner_login,
      card?.incident_code, card?.address, card?.description, assignment.instructions]
      .filter(Boolean).join(' ').toLocaleLowerCase('ru');
    return (Boolean(assignment.attempt_status) || (assignment.mode === 'card' && assignment.status === 'active'))
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
  }).sort((left, right) => Number(pinned.has(right.id)) - Number(pinned.has(left.id))),
  [assignments, filter, group, pinned, search, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const first = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
  const last = Math.min(currentPage * pageSize, filtered.length);

  useEffect(() => setPage(1), [filter, group, pageSize, search, status]);
  useEffect(() => () => resultRequest.current?.abort(), []);

  function viewResult(assignment: Assignment) {
    resultRequest.current?.abort();
    const controller = new AbortController();
    resultRequest.current = controller;
    setResultAssignment(assignment);
    setEvaluation(null);
    setResultError('');
    void api<Evaluation>(`training/attempts/${assignment.attempt_id}/result`, undefined, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setEvaluation(result); })
      .catch((cause: Error) => { if (!controller.signal.aborted) setResultError(cause.message); });
  }

  useEffect(() => {
    const id = linkAssignment?.attempt_id;
    if (!id) return;
    const controller = new AbortController();
    void api<LinkedCard[]>(`training/attempts/${id}/links`, undefined, controller.signal)
      .then((chain) => { if (!controller.signal.aborted) setLinks(chain); })
      .catch((cause: Error) => { if (!controller.signal.aborted) setLinkError(cause.message); });
    return () => controller.abort();
  }, [linkAssignment?.attempt_id, linkReload]);

  useEffect(() => {
    const id = linkAssignment?.attempt_id;
    if (!id) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void api<LinkedCard[]>(`training/attempts/${id}/link-candidates?q=${encodeURIComponent(linkQuery)}`,
        undefined, controller.signal)
        .then((options) => { if (!controller.signal.aborted) setCandidates(options); })
        .catch((cause: Error) => { if (!controller.signal.aborted) setLinkError(cause.message); });
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [linkAssignment?.attempt_id, linkQuery, linkReload]);

  async function linkAction(path: string, body: Record<string, string> = {}) {
    if (!linkAssignment?.attempt_id || linkBusy) return;
    setLinkBusy(true);
    setLinkError('');
    try {
      await api(`training/attempts/${linkAssignment.attempt_id}/links${path}`, body);
      setLinkReload((value) => value + 1);
    } catch (cause) {
      setLinkError(cause instanceof Error ? cause.message : 'Не удалось изменить связь карточек.');
    } finally {
      setLinkBusy(false);
    }
  }

  if (loading) return null;

  return <div className={styles.board} id="incident-list">
    <div className={styles.toolbar}>
      <div className={styles.title}>Список происшествий</div>
      <div className={styles.controls}>
        {moduleOptions.length > 0 && <ChoiceSelect label="Учебный модуль" value={moduleId} onChange={onModuleChange}>
          <option value="">Все модули</option>
          {moduleOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </ChoiceSelect>}
        <WorkspaceSwitch checked={autoRefresh} onChange={onAutoRefresh}>Автообновление</WorkspaceSwitch>
        <ChoiceSelect label="Что показать" value={status} onChange={setStatus}>
          <option value="">Выберите, что показать</option>
          <option value="В работе">В работе</option>
          <option value="Отработана">Отработанные</option>
          <option value="Прервано">Прерванные</option>
        </ChoiceSelect>
      </div>
    </div>

    {!rows.length ? <div className={styles.empty}>Происшествия не найдены</div> : <>
      <TableGrid compact fillColumn={12} viewportClassName={styles.tableViewport}
        headClassName={styles.tableHead} plainHead head={<>
          <span /><span>Связи</span><span /><span>ЧС</span><span />
          <span>Опер.</span><span>АРМ</span><span>Номер</span><span>Дата</span><span>Время</span>
          <span>Тип происшествия</span><span>Постр.</span><span>Адрес</span><span>Статус службы</span><span /><span>Проверено</span>
        </>}>
        <div className={styles.rows}>
          {rows.map((assignment) => <IncidentRow assignment={assignment}
            pinned={pinned.has(assignment.id)} emergency={emergency.has(assignment.id)}
            onToggleMarker={toggleMarker} onViewTimer={(item) => setTimerId(item.id)} onViewResult={viewResult}
            onViewLinks={(item) => {
              setLinkAssignment(item); setLinkQuery(''); setLinks([]); setCandidates([]); setLinkError('');
            }} key={assignment.id} />)}
        </div>
      </TableGrid>

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
    {timerAssignment && <ModalForm label="Время происшествия" onClose={() => setTimerId('')}>
      <div className={styles.resultPanel}>
        <div className={styles.resultHeading}>
          <span>Происшествие {shortNumber(timerAssignment.id)}</span>
          <button type="button" onClick={() => setTimerId('')}>Закрыть</button>
        </div>
        <div className={styles.timeDetails}>
          <div>Назначено: {dateParts(timerAssignment.created_at).stamp || 'Время не указано'}</div>
          <div>Начало работы: {dateParts(timerAssignment.attempt_started_at).stamp || 'Ещё не открыто'}</div>
          {timerAssignment.attempt_started_at && ['created', 'active', 'suspended'].includes(timerAssignment.attempt_status ?? '')
            && <div>Прошло с начала работы: {
            Math.max(0, Math.floor((now - new Date(timerAssignment.attempt_started_at).valueOf()) / 1000))} с</div>}
          {timerAssignment.mode === 'card'
            ? <div>Норматив: открыть за 30 с, внести первый статус за 3 мин.</div>
            : timerAssignment.card_deadline_seconds != null
              && <div>Норматив заполнения: {timerAssignment.card_deadline_seconds} с.</div>}
        </div>
      </div>
    </ModalForm>}
    {resultAssignment && <ModalForm label="Результат занятия" onClose={() => {
      resultRequest.current?.abort();
      setResultAssignment(null);
    }}>
      <div className={styles.resultPanel}>
        <div className={styles.resultHeading}>
          <span>Результат: {resultAssignment.title}</span>
          <button type="button" onClick={() => setResultAssignment(null)}>Закрыть</button>
        </div>
        {evaluation && <EvaluationDetails evaluation={evaluation} />}
        {resultError && <div role="alert">{resultError}</div>}
      </div>
    </ModalForm>}
    {linkAssignment?.attempt_id && <ModalForm label="Связи карточки" onClose={() => setLinkAssignment(null)}>
      <div className={styles.resultPanel}>
        <div className={styles.resultHeading}>
          <span>Связи карточки {shortNumber(linkAssignment.attempt_id)}</span>
          <button type="button" onClick={() => setLinkAssignment(null)}>Закрыть</button>
        </div>
        <div className={styles.linkList}>
          {links.length <= 1 ? <div>Связанных карточек нет</div>
            : links.map((card) => <div className={styles.linkItem} key={card.id}>
              <span>{shortNumber(card.id)} · {card.incident} · {card.address}</span>
              <span>{card.main ? 'Главная' : 'Подчинённая'}</span>
            </div>)}
        </div>
        {links.find((card) => card.id === linkAssignment.attempt_id && !card.main) &&
          <div className={styles.linkActions}>
            <button disabled={linkBusy} type="button" onClick={() => void linkAction('/promote')}>
              Сделать главной
            </button>
            <button disabled={linkBusy} type="button" onClick={() => void linkAction('/detach')}>
              Отвязать
            </button>
          </div>}
        {links.some((card) => card.id === linkAssignment.attempt_id && card.main) && <>
          <label className={styles.linkSearch}>Найти карточку по номеру, адресу или типу
            <input value={linkQuery} maxLength={100} onChange={(event) => setLinkQuery(event.target.value)} />
          </label>
          <div className={styles.linkList}>
            {candidates.filter((card) => !links.some((linked) => linked.id === card.id))
              .map((card) => <div className={styles.linkItem} key={card.id}>
                <span>{shortNumber(card.id)} · {card.incident} · {card.address}
                  {card.matched && <span className={styles.match}> · Совпадение</span>}</span>
                <button disabled={linkBusy} type="button" onClick={() => void linkAction('', { parent_id: card.id })}>
                  Привязать
                </button>
              </div>)}
          </div>
        </>}
        {linkError && <div role="alert" className={styles.linkError}>{linkError}</div>}
      </div>
    </ModalForm>}
  </div>;
}
