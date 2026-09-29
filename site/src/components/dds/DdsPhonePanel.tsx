import { useEffect, useRef, useState } from 'react';
import { previewDdsPhone, recognizeDdsPhone, recordDdsPhone, selectDdsCrew,
  type DdsPhoneParty, type PhoneReport } from '../../speech/trainingApi';
import { startDdsRecording, type DdsRecording } from '../../speech/recordDdsUtterance';
import { microphoneError } from '../../speech/microphoneError';
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
  const [recordingFor, setRecordingFor] = useState('');
  const [spokenText, setSpokenText] = useState('');
  const [incoming, setIncoming] = useState(false);
  const [callerActionsOpen, setCallerActionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const committingRef = useRef(false);
  const recordingRef = useRef<{ capture: DdsRecording; party: DdsPhoneParty;
    direction: 'incoming' | 'outgoing'; topic?: string } | null>(null);
  const canCall = enabled && reports.includes(status) && !!attemptId;
  const canCallCaller = enabled && ['received', 'rejected', ...reports].includes(status) && !!attemptId;

  useEffect(() => {
    if (!canCall || !crew || pendingReport || active || incoming || recordingFor || busy) return undefined;
    const timer = window.setTimeout(() => setIncoming(true), 12000);
    return () => window.clearTimeout(timer);
  }, [canCall, crew, pendingReport, active, incoming, recordingFor, busy]);

  useEffect(() => () => {
    recordingRef.current?.capture.cancel();
    if (audioRef.current) { audioRef.current.onended = null; audioRef.current.pause(); }
  }, []);

  async function refreshAfterSave(action: string) {
    try {
      await onChange();
    } catch {
      onError(`${action}, но карточка не обновилась. Обновите страницу.`);
    }
  }

  async function chooseCrew() {
    if (!attemptId || busy) return;
    setBusy(true);
    onError('');
    try {
      await selectDdsCrew(attemptId, selected.trim());
      await refreshAfterSave('Бригада назначена');
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Не удалось назначить бригаду.');
    } finally { setBusy(false); }
  }

  async function call(party: DdsPhoneParty, direction: 'incoming' | 'outgoing', topic?: string) {
    if (!attemptId || active || recordingRef.current || busy) return;
    setBusy(true);
    setIncoming(false);
    onError('');
    try {
      const capture = await startDdsRecording(() => void finishRecording());
      recordingRef.current = { capture, party, direction, topic };
      setRecordingFor(party === 'crew' ? crew || 'бригадой' : ddsPartyNames[party] || party);
    } catch (cause) {
      onError(microphoneError(cause, 'Не удалось включить микрофон.'));
    } finally { setBusy(false); }
  }

  async function finishRecording() {
    const current = recordingRef.current;
    if (!current || busy) return;
    recordingRef.current = null;
    setRecordingFor('');
    setBusy(true);
    try {
      const pcm16 = await current.capture.finish();
      if (pcm16.length < 10_000) throw new Error('Реплика слишком короткая. Повторите звонок.');
      const { text } = await recognizeDdsPhone(attemptId, pcm16);
      const utterance = text.trim();
      if (!utterance) throw new Error('Речь не распознана. Повторите звонок.');
      const { party, direction, topic } = current;
      const report = await previewDdsPhone(attemptId, party, direction, utterance, topic);
      const audio = new Audio(`/dds/${report.audio}.wav`);
      audioRef.current = audio;
      setActive(report);
      setSpokenText(utterance);
      audio.onended = () => {
        audio.onended = null;
        audio.onerror = null;
        committingRef.current = true;
        setCommitting(true);
        void (async () => {
          try {
            await recordDdsPhone(attemptId, party, direction, utterance, topic);
            await refreshAfterSave('Доклад сохранён');
          } catch (cause) {
            onError(cause instanceof Error ? cause.message : 'Не удалось сохранить доклад.');
          } finally {
            audioRef.current = null;
            setActive(null);
            setSpokenText('');
            setBusy(false);
            committingRef.current = false;
            setCommitting(false);
          }
        })();
      };
      audio.onerror = () => {
        audioRef.current = null;
        setActive(null);
        setSpokenText('');
        setBusy(false);
        onError('Не удалось воспроизвести телефонный доклад.');
      };
      await audio.play();
    } catch (cause) {
      audioRef.current = null;
      setActive(null);
      setSpokenText('');
      setBusy(false);
      onError(cause instanceof Error ? cause.message : 'Не удалось обработать реплику.');
    }
  }

  function hangUp() {
    if (committingRef.current) return;
    if (recordingRef.current) {
      recordingRef.current.capture.cancel();
      recordingRef.current = null;
      setRecordingFor('');
    }
    const audio = audioRef.current;
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audioRef.current = null;
    setActive(null);
    setSpokenText('');
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
    {recordingFor ? <div className={styles.call}>
      <div>Разговор: {recordingFor}</div>
      <div>Говорите в микрофон.</div>
      <button type="button" disabled={busy} onClick={() => void finishRecording()}>Закончить реплику</button>
      <button type="button" onClick={hangUp}>Завершить звонок</button>
    </div> : active ? <div className={styles.call}>
      <div>Разговор: {active.party === 'crew' ? crew || 'бригада' : ddsPartyNames[active.party] || active.party}</div>
      <div>Вы: {spokenText}</div>
      <div>{active.message}</div>
      <button type="button" disabled={committing} onClick={hangUp}>Завершить</button>
    </div> : <>
      {incoming && !pendingReport && <div className={styles.incoming}>
        <span>Звонит старший бригады</span>
        <button type="button" disabled={busy} onClick={() => void call('crew', 'incoming')}>Ответить</button>
      </div>}
      <div className={styles.buttons}>
        {enabled && status === 'accepted' && <button type="button" disabled={busy}
          onClick={() => void call('supervisor', 'outgoing')}>Руководителю</button>}
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
