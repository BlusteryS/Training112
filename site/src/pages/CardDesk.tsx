import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api';
import { WorkspaceHeader } from '../components/shell/WorkspaceHeader';
import { Notice } from '../components/ui/Notice';
import { DdsCardContacts, DdsCardDetails } from '../components/dds/DdsCardDetails';
import { DdsPhonePanel } from '../components/dds/DdsPhonePanel';
import { DdsServiceBar } from '../components/dds/DdsServiceBar';
import { DdsStatusEditor } from '../components/dds/DdsStatusEditor';
import { sameService } from '../components/dds/serviceName';
import { attemptEvents, openCardAttempt, postCardStatus,
  type AttemptEvent, type CardAttempt, type DdsServiceStatus } from '../speech/trainingApi';
import type { Assignment } from '../management/types';
import { useNow } from '../hooks/useNow';
import shell from '../App.module.css';
import styles from './CardDesk.module.css';

export function CardDesk() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const assignmentId = search.get('assignment_id') ?? '';
  const [attempt, setAttempt] = useState<CardAttempt | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [events, setEvents] = useState<AttemptEvent[]>([]);
  const [serviceStatuses, setServiceStatuses] = useState<DdsServiceStatus[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [phoneEnabled, setPhoneEnabled] = useState(true);
  const now = useNow();

  useEffect(() => {
    void api<{ dds_phone: boolean }>('training/capabilities')
      .then((value) => setPhoneEnabled(value.dds_phone))
      .catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setAttempt(null);
    setAssignment(null);
    setEvents([]);
    setServiceStatuses([]);
    setError('');
    void openCardAttempt(user.id, assignmentId).then(async ({ assignment: next, attempt: opened }) => {
      const [history, statuses] = await Promise.all([attemptEvents(opened.id),
        api<DdsServiceStatus[]>(`training/attempts/${opened.id}/services`)]);
      if (cancelled) return;
      setAttempt(opened);
      setAssignment(next);
      setEvents(history);
      setServiceStatuses(statuses);
    }).catch((cause: Error) => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, [assignmentId, user.id]);

  useEffect(() => {
    const id = attempt?.id;
    if (!id) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const statuses = await api<DdsServiceStatus[]>(`training/attempts/${id}/services`,
          undefined, controller.signal);
        if (!cancelled) setServiceStatuses(statuses);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Не удалось обновить статусы служб.');
      } finally {
        if (!cancelled) timer = window.setTimeout(() => void poll(), 5000);
      }
    }
    timer = window.setTimeout(() => void poll(), 5000);
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timer); };
  }, [attempt?.id]);

  if (!attempt || !assignment) {
    return <div className={shell.workspace}>
      <WorkspaceHeader leading={<div className={shell.searchPanel} />} person="Диспетчер ДДС" />
      {error && <div className={styles.startError}><Notice error>{error}</Notice></div>}
    </div>;
  }

  const card = attempt.card ?? {};
  const attemptId = attempt.id;
  const ownService = card.dds_service || assignment.service || '';
  const notified = [...new Set((card.services || ownService).split(',').map((item) => item.trim()).filter(Boolean))];
  if (ownService && !notified.some((item) => sameService(item, ownService))) notified.unshift(ownService);
  const startedAt = attempt.started_at ? new Date(attempt.started_at).valueOf() : null;
  const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const waiting = ['added', 'received'].includes(attempt.card_status);
  const firstRecordRemaining = Math.max(0, 180 - elapsed);
  let pendingReport = '';
  const discrepancy = events.some((event) => event.type === 'dds.phone.report'
    && event.payload.party === 'crew' && event.payload.topic === 'card_error');
  const notified112 = events.some((event) => event.type === 'dds.phone.report'
    && event.payload.party === 'service112');
  for (const event of events) {
    if (event.type === 'card.status') pendingReport = '';
    if (event.type === 'dds.phone.report' && event.payload.report_status) {
      pendingReport = event.payload.report_status;
    }
  }

  async function refresh() {
    const [current, history, statuses] = await Promise.all([
      api<CardAttempt>(`training/attempts/${attemptId}`),
      attemptEvents(attemptId),
      api<DdsServiceStatus[]>(`training/attempts/${attemptId}/services`),
    ]);
    setAttempt(current);
    setEvents(history);
    setServiceStatuses(statuses);
  }

  async function move(next: string, comment: string) {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      await postCardStatus(attemptId, next, comment);
      try {
        await refresh();
      } catch {
        setError('Статус сохранён, но карточка не обновилась. Обновите страницу.');
      }
      if (['completed', 'refused'].includes(next)) navigate('/');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сменить статус.');
      return false;
    } finally { setBusy(false); }
  }

  return <div className={shell.workspace}>
    <WorkspaceHeader person={`Диспетчер ДДС, ${ownService}`} leading={<div className={shell.searchPanel}>
      <div className={shell.staffTitle}>Происшествие</div>
      <div className={shell.searchRule} />
      <div className={shell.searchFooter}>{assignment.title}</div>
    </div>} />
    <div className={styles.content}>
      <div className={styles.phoneRail}>
        <div className={styles.caseHeader}>
          <strong>Происшествие {assignmentId.slice(0, 8).toUpperCase()}</strong>
          <div className={waiting && elapsed > 180 ? styles.late : styles.clock}>
            {waiting ? `Первая запись: ${firstRecordRemaining} с`
              : `Прошло ${elapsed} с`}
          </div>
          <button type="button" onClick={() => navigate('/')}>К списку</button>
        </div>
        <DdsPhonePanel key={attempt.id} attemptId={attempt.id} status={attempt.card_status} crew={attempt.dds_crew}
          callerPhone={card.phone ?? ''} pendingReport={pendingReport || null} enabled={phoneEnabled}
          discrepancy={discrepancy} notified112={notified112}
          onChange={refresh} onError={setError} />
      </div>
      <div className={styles.caseBody}>
        <div className={styles.contactRow}>
          <DdsCardContacts card={card} assignment={assignment} />
        </div>
        <DdsCardDetails card={card} assignment={assignment} statusEditor={
          <DdsStatusEditor status={attempt.card_status} crew={attempt.dds_crew}
            pendingReport={pendingReport} busy={busy} onMove={move} />
        } />
        {error && <Notice error>{error}</Notice>}
      </div>
      <DdsServiceBar services={notified} ownService={ownService} ownStatus={attempt.card_status}
        events={events} login={user.login} now={now} startedAt={startedAt}
        serviceStatuses={serviceStatuses} />
    </div>
  </div>;
}
