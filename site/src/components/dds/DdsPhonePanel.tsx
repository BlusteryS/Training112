import { useEffect, useRef, useState } from 'react';
import { previewDdsPhone, recordDdsPhone, selectDdsCrew, type DdsPhoneParty, type PhoneReport } from '../../speech/trainingApi';
import { InputField } from '../ui/InputField';
import { ddsPartyNames, ddsStatusNames } from './statuses';
import styles from './DdsPhonePanel.module.css';

const reports = ['accepted', 'dispatched', 'arrived', 'working'];

export function DdsPhonePanel({ attemptId, status, crew, callerPhone, pendingReport, discrepancy, notified112, enabled, onChange, onError }: {
  attemptId: string;
  status: string;
  crew: string | null;
  callerPhone: string;
  pendingReport: string | null;
  discrepancy: boolean;
  notified112: boolean;
  enabled: boolean;
  onChange: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [selected, setSelected] = useState('');
  const [active, setActive] = useState<PhoneReport | null>(null);
  const [incoming, setIncoming] = useState(false);
  const [callerActionsOpen, setCallerActionsOpen] = useState(false);
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
      await selectDdsCrew(attemptId, selected.trim());
      await onChange();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Не удалось назначить бригаду.');
    } finally { setBusy(false); }
  }

  async function call(party: DdsPhoneParty, direction: 'incoming' | 'outgoing', topic?: string) {
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
    <div className={styles.heading}><div className={styles.title}>Телефон</div>
      {crew && <div className={styles.crewName}>{crew}</div>}</div>
    {!enabled && <div>Телефон отключён администратором.</div>}
    {status === 'accepted' && !crew && <div className={styles.crewSelect}>
      <InputField label="Бригада или номер расчёта" value={selected} maxLength={100}
        onChange={(event) => setSelected(event.target.value)} />
      <button type="button" disabled={busy || !selected.trim()} onClick={() => void chooseCrew()}>Назначить</button>
    </div>}
    {active ? <div className={styles.call}>
      <div>Разговор: {active.party === 'crew' ? crew || 'бригада' : ddsPartyNames[active.party] || active.party}</div>
      <div>{active.message}</div>
      <button type="button" onClick={hangUp}>Завершить</button>
    </div> : <>
      {incoming && !pendingReport && <div className={styles.incoming}>
        <span>Звонит старший бригады</span>
        <button type="button" disabled={busy} onClick={() => void call('crew', 'incoming')}>Ответить</button>
      </div>}
      <div className={styles.buttons}>
        {enabled && status === 'accepted' && <button type="button" disabled={busy}
          onClick={() => void call('supervisor', 'outgoing')}>Руководителю</button>}
        {enabled && status === 'accepted' && !crew && <button type="button" disabled={busy}
          onClick={() => void call('supervisor', 'outgoing', 'refused')}>Отказ руководителя</button>}
        {canCall && crew && !pendingReport && <button type="button" disabled={busy}
          aria-label="Позвонить бригаде" onClick={() => void call('crew', 'outgoing')}>Бригаде</button>}
        {canCall && crew && !discrepancy && <button type="button" disabled={busy}
          onClick={() => void call('crew', 'outgoing', 'card_error')}>Уточнить адрес</button>}
        {canCall && discrepancy && !notified112 && <button type="button" disabled={busy}
          onClick={() => void call('service112', 'outgoing')}>Сообщить в 112</button>}
        {canCallCaller && callerPhone && <button type="button" className={styles.callerToggle}
          aria-label="Позвонить заявителю" aria-expanded={callerActionsOpen}
          onClick={() => setCallerActionsOpen((open) => !open)}>Заявителю</button>}
      </div>
      {pendingReport && <div className={styles.report}>Доклад: {ddsStatusNames[pendingReport] ?? pendingReport}</div>}
      {canCallCaller && callerPhone && callerActionsOpen && <div className={styles.caller}>
        <div className={styles.topicLabel}>Тема звонка</div>
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={() => void call('caller', 'outgoing', 'address')}>Адрес</button>
          <button type="button" disabled={busy} onClick={() => void call('caller', 'outgoing', 'situation')}>Обстановка</button>
          <button type="button" disabled={busy} onClick={() => void call('caller', 'outgoing', 'victims')}>Пострадавшие</button>
        </div>
      </div>}
    </>}
  </div>;
}
