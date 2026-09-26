import { useEffect, useRef, useState } from 'react';
import { previewDdsPhone, recordDdsPhone, selectDdsCrew, type PhoneReport } from '../../speech/trainingApi';
import { SelectField } from '../ui/SelectField';
import styles from './DdsPhonePanel.module.css';

const reports = ['accepted', 'dispatched', 'arrived', 'working'];
const crews = ['Бригада 1', 'Бригада 2', 'Бригада 3'];
const reportNames: Record<string, string> = {
  dispatched: 'Начало реагирования', arrived: 'Прибытие',
  working: 'Проведение работ', completed: 'Работы завершены', refused: 'Отказ от выполнения работ',
};

export function DdsPhonePanel({ attemptId, status, crew, callerPhone, pendingReport, enabled, onChange, onError }: {
  attemptId: string;
  status: string;
  crew: string | null;
  callerPhone: string;
  pendingReport: string | null;
  enabled: boolean;
  onChange: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [selected, setSelected] = useState('Бригада 1');
  const [active, setActive] = useState<PhoneReport | null>(null);
  const [incoming, setIncoming] = useState(false);
  const [busy, setBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canCall = enabled && reports.includes(status) && !!attemptId;
  const canCallCaller = enabled && ['received', 'rejected', ...reports].includes(status) && !!attemptId;

  useEffect(() => {
    if (!canCall || !crew || pendingReport || active || incoming) return undefined;
    const timer = window.setTimeout(() => setIncoming(true), 12000);
    return () => window.clearTimeout(timer);
  }, [canCall, crew, pendingReport, active, incoming, status]);

  useEffect(() => () => {
    if (audioRef.current) { audioRef.current.onended = null; audioRef.current.pause(); }
  }, []);

  async function chooseCrew() {
    if (!attemptId || busy) return;
    setBusy(true);
    onError('');
    try {
      await selectDdsCrew(attemptId, selected);
      await onChange();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Не удалось назначить бригаду.');
    } finally { setBusy(false); }
  }

  async function call(party: 'crew' | 'caller', direction: 'incoming' | 'outgoing', topic?: string) {
    if (!attemptId || active || busy) return;
    setBusy(true);
    setIncoming(false);
    onError('');
    try {
      const report = await previewDdsPhone(attemptId, party, direction, topic);
      const audio = new Audio(`/dds/${report.audio}.wav`);
      audioRef.current = audio;
      setActive(report);
      audio.onended = () => {
        void (async () => {
          try {
            await recordDdsPhone(attemptId, party, direction, topic);
            await onChange();
          } catch (cause) {
            onError(cause instanceof Error ? cause.message : 'Не удалось сохранить доклад.');
          } finally {
            audioRef.current = null;
            setActive(null);
            setBusy(false);
          }
        })();
      };
      audio.onerror = () => {
        audioRef.current = null;
        setActive(null);
        setBusy(false);
        onError('Не удалось воспроизвести телефонный доклад.');
      };
      await audio.play();
    } catch (cause) {
      audioRef.current = null;
      setActive(null);
      setBusy(false);
      onError(cause instanceof Error ? cause.message : 'Не удалось начать звонок.');
    }
  }

  function hangUp() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audioRef.current = null;
    setActive(null);
    setBusy(false);
  }

  return <div className={styles.panel}>
    <div className={styles.title}>Учебный IP-телефон</div>
    {!enabled && <div>Телефон отключён администратором.</div>}
    {status === 'accepted' && !crew && <div className={styles.crewSelect}>
      <SelectField label="Бригада" value={selected} onChange={(event) => setSelected(event.target.value)}>
        {crews.map((name) => <option key={name} value={name}>{name}</option>)}
      </SelectField>
      <button type="button" disabled={busy} onClick={() => void chooseCrew()}>Назначить бригаду</button>
    </div>}
    {crew && <div>Бригада на вызове: {crew}</div>}
    {active ? <div className={styles.call}>
      <div>Разговор: {active.party === 'crew' ? crew : `заявитель ${callerPhone}`}</div>
      <div>{active.message}</div>
      <button type="button" onClick={hangUp}>Завершить разговор</button>
    </div> : <>
      {incoming && !pendingReport && <div className={styles.incoming}>
        <span>Входящий звонок от старшего бригады</span>
        <button type="button" disabled={busy} onClick={() => void call('crew', 'incoming')}>Ответить</button>
      </div>}
      {canCall && crew && !pendingReport && <button type="button" disabled={busy}
        onClick={() => void call('crew', 'outgoing')}>Позвонить старшему бригады</button>}
      {pendingReport && <div className={styles.report}>Доклад получен. Установите статус «{reportNames[pendingReport] ?? pendingReport}».</div>}
      {canCallCaller && callerPhone && <div className={styles.caller}>
        <div>Заявитель: {callerPhone}</div>
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={() => void call('caller', 'outgoing', 'address')}>Уточнить адрес</button>
          <button type="button" disabled={busy} onClick={() => void call('caller', 'outgoing', 'situation')}>Уточнить обстановку</button>
          <button type="button" disabled={busy} onClick={() => void call('caller', 'outgoing', 'victims')}>Уточнить пострадавших</button>
        </div>
      </div>}
    </>}
  </div>;
}
