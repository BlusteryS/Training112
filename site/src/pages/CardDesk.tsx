import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api';
import { WorkspaceHeader } from '../components/shell/WorkspaceHeader';
import { Notice } from '../components/ui/Notice';
import { DdsCardDetails } from '../components/dds/DdsCardDetails';
import { DdsPhonePanel } from '../components/dds/DdsPhonePanel';
import { DdsServiceBar } from '../components/dds/DdsServiceBar';
import { DdsStatusEditor } from '../components/dds/DdsStatusEditor';
import { sameService } from '../components/dds/serviceName';
import { attemptEvents, ddsServiceStates, openCardAttempt, postCardStatus,
  type AttemptEvent, type CardAttempt, type DdsServiceState } from '../speech/trainingApi';
import type { Assignment } from '../management/types';
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
  const [services, setServices] = useState<DdsServiceState[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void openCardAttempt(user.id, assignmentId).then(async ({ assignment: next, attempt: opened }) => {
      const [history, states] = await Promise.all([attemptEvents(opened.id), ddsServiceStates(opened.id)]);
      if (cancelled) return;
      setAttempt(opened);
      setAssignment(next);
      setEvents(history);
      setServices(states);
    }).catch((cause: Error) => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, [assignmentId, user.id]);

  useEffect(() => {
    if (!attempt?.id) return undefined;
    const timer = window.setInterval(() => {
      void ddsServiceStates(attempt.id).then(setServices).catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
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
  const remaining = Math.max(0, 30 - elapsed);
  let pendingReport = '';
  for (const event of events) {
    if (event.type === 'card.status') pendingReport = '';
    if (event.type === 'dds.phone.report' && event.payload.report_status) {
      pendingReport = event.payload.report_status;
    }
  }

  async function refresh() {
    const [current, history, states] = await Promise.all([
      api<CardAttempt>(`training/attempts/${attemptId}`),
      attemptEvents(attemptId),
      ddsServiceStates(attemptId),
    ]);
    setAttempt(current);
    setEvents(history);
    setServices(states);
  }

  async function move(next: string, comment: string) {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      await postCardStatus(attemptId, next, comment);
      await refresh();
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
      <div className={styles.caseHeader}>
        <div><strong>{assignment.title}</strong><span>Служба: {ownService}</span></div>
        <div className={waiting && elapsed > 30 ? styles.late : styles.clock}>
          {waiting ? elapsed > 30 ? 'Не оповещено' : `До первичного решения ${remaining} с`
            : `С начала занятия прошло ${elapsed} с`}
        </div>
        <button type="button" onClick={() => navigate('/')}>К списку происшествий</button>
      </div>
      <DdsCardDetails card={card} assignment={assignment} />
      <div className={styles.workflow}>
        <DdsPhonePanel attemptId={attempt.id} status={attempt.card_status} crew={attempt.dds_crew}
          callerPhone={card.phone ?? ''} pendingReport={pendingReport || null}
          onChange={refresh} onError={setError} />
        <DdsStatusEditor status={attempt.card_status} crew={attempt.dds_crew}
          pendingReport={pendingReport} busy={busy} onMove={move} />
      </div>
      {error && <Notice error>{error}</Notice>}
      <DdsServiceBar services={notified} ownService={ownService} ownStatus={attempt.card_status}
        serviceStates={services} events={events} login={user.login} now={now} startedAt={startedAt} />
    </div>
  </div>;
}
