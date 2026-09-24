import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { finishAttempt, startAssignedAttempt } from '../speech/trainingApi';
import { VoiceCall } from '../speech/VoiceCall';
import { startCooldown } from '../operatorAvailability';

export type CallPhase = 'waiting' | 'active' | 'error' | 'finished';

function duration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export function SpeechScreen({ phase, phoneNumber, elapsed, message, finishing, onCancel, onRetry, onEnd }: {
  phase: CallPhase;
  phoneNumber: string;
  elapsed: number;
  message: string;
  finishing: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onEnd: () => void;
}) {
  if (phase === 'waiting') return null;
  if (phase !== 'active') return <div>
    <div>{phase === 'finished' ? 'Разговор завершён' : 'Звонок прерван'}</div>
    <p role={phase === 'error' ? 'alert' : 'status'}>{message}</p>
    {phase === 'error' && <button disabled={finishing} onClick={onRetry}>Повторить подключение</button>}
    <button onClick={onCancel}>К списку происшествий</button>
  </div>;
  return <div>
    <div>{phoneNumber ? `Звонок с номера ${phoneNumber}` : 'Номер телефона не определён'}</div>
    <p role="timer" aria-label="Длительность звонка">{duration(elapsed)}</p>
    <p role="status">{message}</p>
    <button onClick={onEnd}>Завершить звонок</button>
  </div>;
}

export function SpeechPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const assignmentId = search.get('assignment_id') ?? '';
  const [phase, setPhase] = useState<CallPhase>('waiting');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [message, setMessage] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
  const call = useRef<VoiceCall | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let admitted = false;
    let attemptId: string | undefined;
    let finishRequested = false;
    async function finish(failed = false) {
      if (!attemptId || finishRequested) return;
      finishRequested = true;
      if (!disposed) setFinishing(true);
      try { await finishAttempt(attemptId, failed); }
      catch (error) {
        finishRequested = false;
        if (!disposed) setMessage(error instanceof Error ? error.message : 'Не удалось завершить попытку. Откройте текущее задание повторно.');
      } finally { if (!disposed) setFinishing(false); }
    }
    let current: VoiceCall;
    let disposed = false;
    const callbacks = {
      status: (text: string) => { if (call.current === current) setMessage(text); },
      waiting: () => {},
      ready: () => {
        if (call.current !== current) return;
        admitted = true;
        setStartedAt((previous) => previous ?? Date.now());
        setPhase('active');
      },
      text: () => undefined,
      closed: (failed: boolean) => {
        if (call.current !== current) return;
        call.current = null;
        startCooldown(user.id);
        setPhase(failed ? 'error' : 'finished');
        void finish(failed);
      },
    };
    setPhase('waiting');
    setFinishing(false);
    setPhoneNumber('');
    setStartedAt(null);
    const waitingAt = Date.now();
    setNow(waitingAt);
    // Let StrictMode's setup/cleanup cycle finish before requesting the microphone.
    const start = setTimeout(() => {
      void startAssignedAttempt(user.id, assignmentId).then(async ({ id, phone }) => {
        attemptId = id;
        setPhoneNumber(phone);
        if (disposed) { await finish(true); return; }
        current = new VoiceCall(callbacks, id);
        call.current = current;
        await current.start();
      }).catch((error: unknown) => {
        if (disposed) return;
        const text = error instanceof Error ? error.message : 'Не удалось начать звонок.';
        if (current) current.close(text);
        else { setMessage(text); setPhase('error'); }
      });
    }, 0);
    return () => {
      disposed = true;
      clearTimeout(start);
      if (call.current === current) call.current = null;
      current?.close();
      void finish(!admitted);
    };
  }, [attempt, assignmentId, user.id]);

  return <SpeechScreen
    phoneNumber={phoneNumber}
    elapsed={startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1_000))}
    message={message}
    finishing={finishing}
    onCancel={() => navigate('/')}
    onEnd={() => call.current?.close()}
    onRetry={() => setAttempt((value) => value + 1)}
    phase={phase}
  />;
}
