import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@training112/components';
import { VoiceCall } from '../speech/VoiceCall';
import styles from './SpeechPage.module.css';

type Voice = { id: string; name: string; age: number };
type Line = { speaker: 'operator' | 'caller'; text: string; turn?: number };

export function SpeechPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voice, setVoice] = useState('');
  const [status, setStatus] = useState('Загружаем персонажей…');
  const [active, setActive] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [retry, setRetry] = useState(0);
  const [catalogError, setCatalogError] = useState(false);
  const call = useRef<VoiceCall | null>(null);
  const transcript = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogError(false);
    setStatus('Загружаем персонажей…');
    void (async () => {
      try {
        const response = await fetch('/api/speech/voices', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) {
          const error = await response.json() as { error?: { message?: string } };
          throw new Error(error.error?.message ?? 'Не удалось загрузить персонажей.');
        }
        const catalog = await response.json() as { voices: Voice[]; default: string };
        if (!catalog.voices.length || !catalog.voices.some((item) => item.id === catalog.default)) {
          throw new Error('Список персонажей недоступен.');
        }
        if (controller.signal.aborted) return;
        setVoices(catalog.voices);
        setVoice(catalog.default);
        setStatus('Выберите звонящего и подключитесь к разговору.');
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatus(error instanceof Error ? error.message : 'Не удалось загрузить персонажей.');
        setCatalogError(true);
      }
    })();
    return () => controller.abort();
  }, [retry]);

  useEffect(() => () => {
    const current = call.current;
    call.current = null;
    current?.close();
  }, []);

  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [lines]);

  async function start() {
    if (call.current) return;
    const current = new VoiceCall(voice, {
      status: (message) => { if (call.current === current) setStatus(message); },
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
        setActive(false);
      },
    });
    call.current = current;
    setLines([]);
    setActive(true);
    try {
      await current.start();
    } catch (error) {
      current.close(error instanceof Error ? error.message : 'Не удалось включить микрофон.');
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Учебный сеанс</h1>
          <p>Отвечайте звонящему как оператор службы 112.</p>
        </div>
        <Link to="/">Вернуться в профиль</Link>
      </header>
      <section aria-label="Управление разговором" className={styles.controls}>
        <label className={styles.voice}>
          Звонящий
          <select disabled={active || !voices.length} onChange={(event) => setVoice(event.target.value)} value={voice}>
            {voices.map((item) => <option key={item.id} value={item.id}>{item.name}, {item.age} лет</option>)}
          </select>
        </label>
        {active ? <Button appearance="negative" onClick={() => call.current?.close()}>Завершить разговор</Button>
          : <Button disabled={!voice || catalogError} onClick={() => void start()}>Подключиться</Button>}
        {catalogError && <Button onClick={() => setRetry((value) => value + 1)}>Повторить загрузку</Button>}
      </section>
      <p className={styles.status} role="status">{status}</p>
      <div aria-label="Диалог" aria-live="polite" className={styles.transcript} ref={transcript} role="log">
        {lines.length === 0 ? <p className={styles.empty}>Здесь появится разговор. Микрофон остаётся включённым, пока вы слушаете ответ.</p>
          : lines.map((line, index) => (
            <p className={styles.line} data-speaker={line.speaker} key={index}>
              <strong>{line.speaker === 'operator' ? 'Вы' : 'Звонящий'}</strong>
              <span>{line.text}</span>
            </p>
          ))}
      </div>
    </main>
  );
}
