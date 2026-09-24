import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { WorkspaceHeader } from '../components/shell/WorkspaceHeader';
import { ActionButton, ActionRow } from '../components/ui/ActionButton';
import { Field } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { finishAttempt, openCardAttempt, postCardStatus, saveAttemptCard } from '../speech/trainingApi';
import styles from '../App.module.css';
import panel from '../management/Panel.module.css';

const labels: Record<string, string> = {
  received: 'Не оповещено',
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

export function CardDesk() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const assignmentId = search.get('assignment_id') ?? '';
  const [attemptId, setAttemptId] = useState('');
  const [status, setStatus] = useState('received');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [message, setMessage] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [deadline, setDeadline] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void openCardAttempt(user.id, assignmentId).then(({ assignment, attempt }) => {
      setAttemptId(attempt.id);
      setStatus(attempt.card_status || 'received');
      setTitle(assignment.title);
      setInstructions(assignment.instructions ?? '');
      setMessage(attempt.card?.description ?? '');
      setDeadline(assignment.card_deadline_seconds);
      setStartedAt(attempt.started_at ? new Date(attempt.started_at).valueOf() : Date.now());
    }).catch((cause: Error) => setError(cause.message));
  }, [assignmentId, user.id]);

  const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const left = deadline === null ? null : deadline - elapsed;
  const needsComment = (next: string) => next === 'rejected' || next === 'refused';

  async function saveText() {
    if (!attemptId || busy) return;
    setBusy(true); setError('');
    try { await saveAttemptCard(attemptId, { description: message }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить текст.'); }
    finally { setBusy(false); }
  }

  async function move(next: string) {
    if (!attemptId || busy) return;
    if (needsComment(next) && !comment.trim()) { setError('Для отказа нужен комментарий.'); return; }
    setBusy(true); setError('');
    try {
      if (message.trim()) await saveAttemptCard(attemptId, { description: message });
      const attempt = await postCardStatus(attemptId, next, comment);
      setStatus(attempt.card_status);
      setComment('');
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

  return <div className={styles.workspace}>
    <WorkspaceHeader leading={<div className={styles.searchPanel}>
      <div className={styles.staffTitle}>Отработка карточки</div>
      <div className={styles.searchRule} />
      <div className={styles.searchFooter}>{title || 'Карточка'}</div>
    </div>} />
    <div className={`${styles.operatorContent} ${panel.root}`}>
      <div>Статус: {labels[status] ?? status}. {left === null ? '' : left >= 0 ? `До норматива принятия: ${left} с.` : `Норматив принятия превышен на ${-left} с.`}</div>
      {instructions && <div>{instructions}</div>}
      <Field label="Текст реагирования"><textarea rows={4} maxLength={4000} value={message} onChange={(event) => setMessage(event.target.value)} /></Field>
      <Field label="Комментарий к отказу"><textarea rows={3} maxLength={4000} value={comment} onChange={(event) => setComment(event.target.value)} /></Field>
      <ActionRow>
        <ActionButton disabled={busy} onClick={() => void saveText()}>Сохранить текст</ActionButton>
        {(transitions[status] ?? []).map((next) => <ActionButton key={next} disabled={busy} onClick={() => void move(next)}>{labels[next]}</ActionButton>)}
        <ActionButton disabled={busy || !attemptId} onClick={() => void finish()}>Завершить отработку</ActionButton>
        <ActionButton onClick={() => navigate('/')}>К списку</ActionButton>
      </ActionRow>
      {error && <Notice error>{error}</Notice>}
    </div>
  </div>;
}
