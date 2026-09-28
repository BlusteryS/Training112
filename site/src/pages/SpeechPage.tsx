import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api';
import { useNotification } from '../components/Notifications';
import { startCooldown } from '../operatorAvailability';
import { finishAttempt, saveAttemptCard, startAssignedAttempt } from '../speech/trainingApi';
import { VoiceCall } from '../speech/VoiceCall';
import { useNow } from '../hooks/useNow';
import { CallWorkspace } from './CallWorkspace';
import type { IncidentDraft } from './callDraft';
import styles from './SpeechPage.module.css';

type CallPhase = 'waiting' | 'active' | 'error' | 'finished';

function incidentNumber(id: string) {
  const digits = id.replace(/\D/g, '').slice(0, 6);
  return digits || id.slice(0, 6).toUpperCase();
}

function callError(cause: unknown) {
  if (cause instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(cause.name)) {
    return 'Доступ к микрофону запрещён. Разрешите его в браузере и системе, затем повторите подключение.';
  }
  const message = cause instanceof Error ? cause.message : '';
  if (/permission denied|notallowederror/i.test(message)) {
    return 'Доступ к микрофону запрещён. Разрешите его в браузере и системе, затем повторите подключение.';
  }
  return message || 'Не удалось начать звонок.';
}

export function SpeechPage() {
  const { user } = useAuth();
  const notify = useNotification();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const assignmentId = search.get('assignment_id') ?? '';
  const [phase, setPhase] = useState<CallPhase>('waiting');
  const [phone, setPhone] = useState('');
  const [card, setCard] = useState<Record<string, string> | null>(null);
  const [deadlineSeconds, setDeadlineSeconds] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const now = useNow();
  const [attemptId, setAttemptId] = useState('');
  const call = useRef<VoiceCall | null>(null);
  const attemptIdRef = useRef('');
  const savedRef = useRef(false);
  const leavingRef = useRef(false);

  useEffect(() => {
    let current: VoiceCall | undefined;
    let admitted = false;
    let disposed = false;
    let failedAttempt = false;
    let originalStartedAt: number | null = null;

    savedRef.current = false;
    leavingRef.current = false;
    attemptIdRef.current = '';
    setAttemptId('');
    setPhone('');
    setCard(null);
    setDeadlineSeconds(null);
    setMessage('');
    setStartedAt(null);
    setPhase('waiting');

    const failAttempt = () => {
      const id = attemptIdRef.current;
      if (!id || failedAttempt || savedRef.current) return;
      failedAttempt = true;
      void finishAttempt(id, true).catch((cause: unknown) => {
        notify(cause instanceof Error ? cause.message : 'Не удалось закрыть попытку.', 'error');
      });
    };

    const callbacks = {
      status: (text: string) => { if (call.current === current) setMessage(text); },
      waiting: () => undefined,
      ready: () => {
        if (call.current !== current) return;
        admitted = true;
        setStartedAt(originalStartedAt ?? Date.now());
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
        if (disposed) {
          failAttempt();
          return;
        }
        setAttemptId(assigned.id);
        setPhone(assigned.phone);
        setCard(assigned.card);
        setDeadlineSeconds(assigned.deadlineSeconds);
        originalStartedAt = assigned.startedAt;
        current = new VoiceCall(callbacks, assigned.id);
        call.current = current;
        await current.start();
      }).catch((cause: unknown) => {
        if (disposed) return;
        const text = callError(cause);
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
  }, [assignmentId, notify, retry, user.id]);

  async function save(draft: IncidentDraft, linkedTo: string | null) {
    const id = attemptIdRef.current;
    if (!id) throw new Error('Карточка вызова не создана.');
    setSaving(true);
    try {
      await saveAttemptCard(id, draft);
      savedRef.current = true;
      leavingRef.current = true;
      call.current?.close();
      await finishAttempt(id);
      if (linkedTo) {
        try {
          await api(`training/attempts/${id}/links`, { parent_id: linkedTo });
        } catch (cause) {
          notify(cause instanceof Error ? `Карточка сохранена, но связь не добавлена: ${cause.message}`
            : 'Карточка сохранена, но связь не добавлена.', 'error');
        }
      }
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

  if (phase === 'waiting' && !attemptId) return null;

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
    registeredAt={startedAt}
    message={message || (phase === 'active' ? 'Идёт разговор' : 'Разговор завершён')}
    connected={phase === 'active'} initialCard={card} incidentNumber={incidentNumber(attemptId)}
    attemptId={attemptId}
    deadlineSeconds={deadlineSeconds}
    saving={saving || phase === 'waiting'} onEndCall={() => call.current?.close()} onCancel={() => void cancel()} onSave={save} />;
}
