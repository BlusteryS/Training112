import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { finishAttempt, startAssignedAttempt } from '../speech/trainingApi';
import { VoiceCall } from '../speech/VoiceCall';

export type CallPhase = 'waiting' | 'active' | 'error' | 'finished';
export type CallLine = { speaker: 'operator' | 'caller'; text: string; turn?: number };

function duration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export function SpeechScreen({ phase, phoneNumber, lines, elapsed, remaining, message, finishing, onCancel, onRetry, onEnd }: {
  phase: CallPhase;
  phoneNumber: string;
  lines: CallLine[];
  remaining: number | null;
  elapsed: number;
  message: string;
  finishing: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onEnd: () => void;
}) {
  if (phase !== 'active') return <main>
    <h1>{phase === 'waiting' ? 'Подключаем учебный звонок' : phase === 'finished' ? 'Разговор завершён' : 'Звонок прерван'}</h1>
    <p role={phase === 'error' ? 'alert' : 'status'}>{message}</p>
    {phase === 'waiting' && remaining !== null && <p>Ожидание подключения: около {remaining} сек.</p>}
    {phase === 'error' && <button disabled={finishing} onClick={onRetry}>Повторить подключение</button>}
    <button onClick={onCancel}>К моим заданиям</button>
  </main>;
  return <main aria-label="Учебный звонок">
    <h1>{phoneNumber}</h1>
    <p role="timer" aria-label="Длительность звонка">{duration(elapsed)}</p>
    <section aria-label="Сообщения разговора" role="log" aria-live="polite" aria-relevant="additions text">
      {lines.map((line, index) => <p key={index}>
        <strong>{line.speaker === 'caller' ? 'Заявитель' : 'Оператор'}:</strong> {line.text}
      </p>)}
    </section>
    <p role="status">{message}</p>
    <button onClick={onEnd}>Завершить звонок</button>
  </main>;
}

export function SpeechPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const assignmentId = search.get('assignment_id') ?? '';
  const [phase, setPhase] = useState<CallPhase>('waiting');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [lines, setLines] = useState<CallLine[]>([]);
  const [message, setMessage] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
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
      waiting: (seconds: number) => {
        if (call.current === current) {
          const receivedAt = Date.now();
          setNow(receivedAt);
          setWaitUntil(receivedAt + seconds * 1_000);
        }
      },
      ready: () => {
        if (call.current !== current) return;
        admitted = true;
        setPhoneNumber('Учебный звонок');
        setStartedAt((previous) => previous ?? Date.now());
        setPhase('active');
      },
      text: (speaker: 'operator' | 'caller', text: string, turn?: number) => {
        if (call.current !== current) return;
        setLines((previous) => {
          const last = previous.at(-1);
          if (speaker === 'caller' && last?.speaker === 'caller' && last.turn === turn) {
            return [...previous.slice(0, -1), { ...last, text: `${last.text} ${text}` }];
          }
          return [...previous, { speaker, text, turn }];
        });
      },
      closed: (failed: boolean) => {
        if (call.current !== current) return;
        call.current = null;
        setPhase(failed ? 'error' : 'finished');
        void finish(failed);
      },
    };
    setPhase('waiting');
    setFinishing(false);
    setLines([]);
    setStartedAt(null);
    const waitingAt = Date.now();
    setNow(waitingAt);
    setWaitUntil(null);
    // Let StrictMode's setup/cleanup cycle finish before requesting the microphone.
    const start = setTimeout(() => {
      void startAssignedAttempt(user.id, assignmentId).then(async (id) => {
        attemptId = id;
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
    lines={lines}
    message={message}
    finishing={finishing}
    onCancel={() => navigate('/')}
    onEnd={() => call.current?.close()}
    onRetry={() => setAttempt((value) => value + 1)}
    phase={phase}
    remaining={waitUntil === null ? null : Math.max(1, Math.ceil((waitUntil - now) / 1_000))}
  />;
}
