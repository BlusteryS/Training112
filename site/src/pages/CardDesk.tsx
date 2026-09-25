import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { WorkspaceHeader } from '../components/shell/WorkspaceHeader';
import { ActionButton, ActionRow } from '../components/ui/ActionButton';
import { TextareaField } from '../components/ui/TextareaField';
import { Notice } from '../components/ui/Notice';
import { attemptEvents, finishAttempt, openCardAttempt, postCardStatus, type AttemptEvent } from '../speech/trainingApi';
import type { Assignment } from '../management/types';
import styles from '../App.module.css';
import panel from '../management/Panel.module.css';
import desk from './CardDesk.module.css';

const labels: Record<string, string> = {
  added: 'Добавлена',
  received: 'Получена',
  accepted: 'Принята',
  rejected: 'Не принята',
  dispatched: 'Начало реагирования',
  arrived: 'Прибытие',
  working: 'Проведение работ',
  completed: 'Работы завершены',
  refused: 'Отказ от выполнения работ',
};

const transitions: Record<string, string[]> = {
  received: ['accepted', 'rejected'],
  rejected: ['accepted'],
  accepted: ['dispatched', 'arrived', 'working', 'completed', 'refused'],
  dispatched: ['arrived', 'working', 'completed', 'refused'],
  arrived: ['working', 'completed', 'refused'],
  working: ['completed', 'refused'],
};

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

function text(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : 'нет';
}

export function CardDesk() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const assignmentId = search.get('assignment_id') ?? '';
  const [attemptId, setAttemptId] = useState('');
  const [status, setStatus] = useState('added');
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [card, setCard] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<AttemptEvent[]>([]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [deadline, setDeadline] = useState(30);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void openCardAttempt(user.id, assignmentId).then(async ({ assignment: next, attempt }) => {
      setAttemptId(attempt.id);
      setAssignment(next);
      setStatus(attempt.card_status || 'received');
      setCard(attempt.card ?? {});
      setDeadline(next.card_deadline_seconds ?? 30);
      setStartedAt(attempt.started_at ? new Date(attempt.started_at).valueOf() : null);
      setEvents(await attemptEvents(attempt.id));
    }).catch((cause: Error) => setError(cause.message));
  }, [assignmentId, user.id]);

  const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const left = deadline - elapsed;
  const waiting = status === 'added' || status === 'received';
  const service = card.services || assignment?.service || '';
  const needsComment = (next: string) => next === 'rejected' || next === 'refused' || next === 'completed';
  const shown = (key: string, fallback?: string | null) => text(card[key] || fallback);

  async function move(next: string) {
    if (!attemptId || busy) return;
    if (needsComment(next) && !comment.trim()) { setError('К статусу нужен комментарий.'); return; }
    setBusy(true); setError('');
    try {
      const attempt = await postCardStatus(attemptId, next, comment.trim());
      setStatus(attempt.card_status);
      setComment('');
      setEvents(await attemptEvents(attemptId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сменить статус.');
    } finally { setBusy(false); }
  }

  async function finish() {
    if (!attemptId || busy) return;
    setBusy(true);
    try {
      await finishAttempt(attemptId, false);
      navigate('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось завершить отработку.');
      setBusy(false);
    }
  }

  const history = events.filter((event) => event.type === 'card.status' && event.payload?.status);

  return <div className={styles.workspace}>
    <WorkspaceHeader person={service ? `Диспетчер ДДС, ${service}` : 'Диспетчер ДДС'} leading={<div className={styles.searchPanel}>
      <div className={styles.staffTitle}>{assignment?.title || 'Карточка'}</div>
      <div className={styles.searchRule} />
      <div className={styles.searchFooter}>{service || 'Служба не указана'}</div>
    </div>} />
    <div className={`${styles.operatorContent} ${panel.root}`}>
      <div>Статус службы: {labels[status] ?? status}. {waiting ? left >= 0 ? `До норматива принятия: ${left} с.` : 'Карточка: Не оповещено.' : ''}</div>
      <div className={desk.sheet}>
        <label>Заявитель<span>{shown('caller_name', assignment?.facts?.caller_name)}</span></label>
        <label>Телефон<span>{shown('phone', assignment?.facts?.phone)}</span></label>
        <label className={desk.wide}>Адрес<span>{shown('address', assignment?.facts?.address)}</span></label>
        <label className={desk.wide}>Описание<span>{shown('description', assignment?.facts?.incident)}</span></label>
        <label>Пострадавшие<span>{shown('victims', assignment?.facts?.victims)}</span></label>
        <label>Источник<span>{shown('origin', assignment?.origin)}</span></label>
        <label className={desk.wide}>Служба<span>{text(service)}</span></label>
      </div>
      <div className={desk.history}>Статусы
        {history.length === 0 && <div>Статусов нет</div>}
        {history.map((event, index) => <div key={`${event.created_at}-${index}`}>
          <span>{labels[event.payload.status ?? ''] ?? event.payload.status} · {timeFormatter.format(new Date(event.created_at))}</span>
          {event.payload.comment ? <span>{event.payload.comment}</span> : null}
        </div>)}
      </div>
      <TextareaField label="Комментарий к статусу" maxLength={4000} value={comment} onChange={(event) => setComment(event.target.value)} />
      <ActionRow>
        {(transitions[status] ?? []).map((next) => <ActionButton key={next} disabled={busy} onClick={() => void move(next)}>{labels[next]}</ActionButton>)}
        <ActionButton disabled={busy || !attemptId} onClick={() => void finish()}>Завершить отработку</ActionButton>
        <ActionButton onClick={() => navigate('/')}>К списку</ActionButton>
      </ActionRow>
      {error && <Notice error>{error}</Notice>}
    </div>
  </div>;
}
