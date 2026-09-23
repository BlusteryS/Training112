import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Badge, Button, Card, Cell, Placeholder } from '@training112/components';
import { VoiceCall } from '../speech/VoiceCall';
import styles from './SpeechPage.module.css';

export type CallPhase = 'waiting' | 'active' | 'error';
export type CallLine = { speaker: 'operator' | 'caller'; text: string; turn?: number };

const plurals = new Intl.PluralRules('ru');
function waitingTime(seconds: number) {
  const word = { one: 'секунда', few: 'секунды', many: 'секунд', other: 'секунды' };
  return `${seconds} ${word[plurals.select(seconds) as keyof typeof word] ?? 'секунд'}`;
}

function duration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function randomPhoneNumber() {
  const digits = Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, '0');
  return `+7 (9${digits.slice(0, 2)}) ${digits.slice(2, 5)}-${digits.slice(5, 7)}-${digits.slice(7)}`;
}

export function SpeechScreen({ phase, phoneNumber, lines, remaining, elapsed, message, onCancel, onRetry, onEnd }: {
  phase: CallPhase;
  phoneNumber: string;
  lines: CallLine[];
  remaining: number;
  elapsed: number;
  message: string;
  onCancel: () => void;
  onRetry: () => void;
  onEnd: () => void;
}) {
  const transcript = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

  useEffect(() => {
    if (follow.current) transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [lines]);

  if (phase === 'waiting' || phase === 'error') {
    return (
      <main className={styles.waiting}>
        <Placeholder
          icon={phase === 'waiting' ? <span aria-hidden="true" className={styles.spinner} /> : undefined}
          title={<span role="status">{phase === 'waiting' ? 'Ожидаем запрос' : 'Не удалось начать звонок'}</span>}
          subtitle={phase === 'waiting' ? `Примерное время ожидания: ${waitingTime(remaining)}` : message}
          actions={phase === 'waiting'
            ? <Button mode="outline" onClick={onCancel} size="large">Отменить поиск</Button>
            : <><Button onClick={onRetry} size="large">Повторить</Button><Button mode="outline" onClick={onCancel} size="large">В профиль</Button></>}
        />
      </main>
    );
  }

  return (
    <main aria-label="Учебный звонок" className={styles.workspace}>
      <section aria-label="Звонок и история сообщений" className={styles.call}>
        <header className={styles.header}>
          <Cell
            subhead={<span role="status">Активный звонок</span>}
            title={phoneNumber}
            after={<Badge aria-label={`Длительность звонка ${duration(elapsed)}`} className={styles.timer} role="timer">{duration(elapsed)}</Badge>}
          />
        </header>
        <section aria-labelledby="call-history-title" className={styles.history}>
          <header className={styles.historyHeading}>
            <h1 id="call-history-title">История звонка</h1>
            <p>Здесь хранится весь диалог в реальном времени</p>
          </header>
          <div
            aria-label="Сообщения разговора"
            aria-live="polite"
            aria-relevant="additions text"
            className={styles.transcript}
            onScroll={(event) => {
              const element = event.currentTarget;
              follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
            }}
            ref={transcript}
            role="log"
          >
            {lines.map((line, index) => {
              const name = line.speaker === 'caller' ? 'Заявитель' : 'Оператор';
              return (
                <Card className={styles.message} key={index}>
                  <div className={styles.messageBody}>
                    <Avatar aria-hidden="true" name={name} size={32} variant="placeholder" />
                    <div className={styles.messageText}>
                      <span className={styles.speaker}>{name}</span>
                      <p>{line.text}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
        <footer className={styles.footer}>
          <Button appearance="negative" mode="outline" onClick={onEnd}>Завершить звонок</Button>
        </footer>
      </section>
      <div aria-hidden="true" className={styles.reserved} />
    </main>
  );
}

export function SpeechPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<CallPhase>('waiting');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [lines, setLines] = useState<CallLine[]>([]);
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [waitUntil, setWaitUntil] = useState(() => Date.now() + 5_000);
  const [now, setNow] = useState(Date.now);
  const call = useRef<VoiceCall | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let admitted = false;
    const current = new VoiceCall({
      status: (text) => { if (call.current === current) setMessage(text); },
      waiting: (seconds) => {
        if (call.current === current) {
          const receivedAt = Date.now();
          setNow(receivedAt);
          setWaitUntil(receivedAt + seconds * 1_000);
        }
      },
      ready: () => {
        if (call.current !== current) return;
        admitted = true;
        setPhoneNumber(randomPhoneNumber());
        setStartedAt(Date.now());
        setPhase('active');
      },
      text: (speaker, text, turn) => {
        if (call.current !== current) return;
        setLines((previous) => {
          const last = previous.at(-1);
          if (speaker === 'caller' && last?.speaker === 'caller' && last.turn === turn) {
            return [...previous.slice(0, -1), { ...last, text: `${last.text} ${text}` }];
          }
          return [...previous, { speaker, text, turn }];
        });
      },
      closed: () => {
        if (call.current !== current) return;
        call.current = null;
        if (admitted) navigate('/', { replace: true });
        else setPhase('error');
      },
    });
    call.current = current;
    setPhase('waiting');
    setLines([]);
    setStartedAt(null);
    const waitingAt = Date.now();
    setNow(waitingAt);
    setWaitUntil(waitingAt + 5_000);
    // Let StrictMode's setup/cleanup cycle finish before requesting the microphone.
    const start = setTimeout(() => {
      void current.start().catch((error: unknown) => {
        current.close(error instanceof Error ? error.message : 'Не удалось включить микрофон.');
      });
    }, 0);
    return () => {
      clearTimeout(start);
      if (call.current === current) call.current = null;
      current.close();
    };
  }, [attempt, navigate]);

  return <SpeechScreen
    phoneNumber={phoneNumber}
    elapsed={startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1_000))}
    lines={lines}
    message={message}
    onCancel={() => navigate('/')}
    onEnd={() => call.current?.close()}
    onRetry={() => setAttempt((value) => value + 1)}
    phase={phase}
    remaining={Math.max(1, Math.ceil((waitUntil - now) / 1_000))}
  />;
}
