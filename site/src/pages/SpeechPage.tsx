import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { startCooldown } from '../operatorAvailability';
import { finishAttempt, saveAttemptCard, startAssignedAttempt } from '../speech/trainingApi';
import { VoiceCall } from '../speech/VoiceCall';
import { CallWorkspace, type IncidentDraft } from './CallWorkspace';
import styles from './SpeechPage.module.css';

type CallPhase = 'waiting' | 'active' | 'error' | 'finished';

function incidentNumber(id: string) {
  const digits = id.replace(/\D/g, '').slice(0, 6);
  return digits || id.slice(0, 6).toUpperCase();
}

export function SpeechPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const assignmentId = search.get('assignment_id') ?? '';
  const [phase, setPhase] = useState<CallPhase>('waiting');
  const [phone, setPhone] = useState('');
  const [card, setCard] = useState<Record<string, string> | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
  const [attemptId, setAttemptId] = useState('');
  const call = useRef<VoiceCall | null>(null);
  const attemptIdRef = useRef('');
  const savedRef = useRef(false);
  const leavingRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let current: VoiceCall | undefined;
    let admitted = false;
    let disposed = false;
    let failedAttempt = false;

    savedRef.current = false;
    leavingRef.current = false;
    attemptIdRef.current = '';
    setAttemptId('');
    setPhone('');
    setCard(null);
    setMessage('');
    setStartedAt(null);
    setPhase('waiting');
    setNow(Date.now());

    const failAttempt = () => {
      const id = attemptIdRef.current;
      if (!id || failedAttempt || savedRef.current) return;
      failedAttempt = true;
      void finishAttempt(id, true);
    };

    const callbacks = {
      status: (text: string) => { if (call.current === current) setMessage(text); },
      waiting: () => undefined,
      ready: () => {
        if (call.current !== current) return;
        admitted = true;
        setStartedAt(Date.now());
        setPhase('active');
      },
      text: () => undefined,
      closed: (failed: boolean) => {
        if (call.current !== current) return;
        call.current = null;
        startCooldown(user.id);
        if (failed && !admitted) {
          failAttempt();
          setPhase('error');
          return;
        }
        setPhase('finished');
      },
    };

    const start = window.setTimeout(() => {
      void startAssignedAttempt(user.id, assignmentId).then(async (assigned) => {
        attemptIdRef.current = assigned.id;
        setAttemptId(assigned.id);
        setPhone(assigned.phone);
        setCard(assigned.card);
        if (disposed) {
          failAttempt();
          return;
        }
        current = new VoiceCall(callbacks, assigned.id);
        call.current = current;
        await current.start();
      }).catch((cause: unknown) => {
        if (disposed) return;
        const text = cause instanceof Error ? cause.message : 'Не удалось начать звонок.';
        if (current) current.close(text);
        else {
          failAttempt();
          setMessage(text);
          setPhase('error');
        }
      });
    }, 0);

    return () => {
      disposed = true;
      window.clearTimeout(start);
      if (call.current === current) call.current = null;
      current?.close();
      if (!leavingRef.current) failAttempt();
    };
  }, [assignmentId, retry, user.id]);

  async function save(draft: IncidentDraft) {
    const id = attemptIdRef.current;
    if (!id) throw new Error('Карточка вызова не создана.');
    setSaving(true);
    try {
      await saveAttemptCard(id, draft);
      savedRef.current = true;
      leavingRef.current = true;
      call.current?.close();
      await finishAttempt(id);
      startCooldown(user.id);
      navigate('/');
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    if (leavingRef.current) return;
    leavingRef.current = true;
    call.current?.close();
    const id = attemptIdRef.current;
    if (id && !savedRef.current) {
      try {
        await finishAttempt(id, true);
      } catch {
        leavingRef.current = false;
        return;
      }
    }
    startCooldown(user.id);
    navigate('/');
  }

  if (phase === 'waiting') return null;

  if (phase === 'error') {
    return <div className={styles.errorPage}>
      <div className={styles.errorCard}>
        <div className={styles.errorTitle}>Звонок прерван</div>
        <div role="alert">{message}</div>
        <div className={styles.errorActions}>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>Повторить подключение</button>
          <button type="button" onClick={() => void cancel()}>К списку происшествий</button>
        </div>
      </div>
    </div>;
  }

  return <CallWorkspace user={user} phone={phone}
    elapsed={startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1_000))}
    message={message || (phase === 'active' ? 'Идёт разговор' : 'Разговор завершён')}
    connected={phase === 'active'} initialCard={card} incidentNumber={incidentNumber(attemptId)}
    saving={saving} onEndCall={() => call.current?.close()} onCancel={() => void cancel()} onSave={save} />;
}
