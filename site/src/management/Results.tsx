import { useEffect, useState } from 'react';
import { api } from '../api';
import { ModalForm } from '../components/ModalForm';
import { FormCard, formGrid } from './FormCard';
import { InputField } from '../components/ui/InputField';
import { TextareaField } from '../components/ui/TextareaField';
import { attemptNames, type Assignment } from './types';
import { Desk, DeskEmpty, DeskRow, DeskTable, deskActions, deskError } from './Desk';

type Check = { id: string; description: string; status: string; actual?: string; expected?: string };
type Review = { reason: string; result: { score?: number; recommendation?: string }; created_at: string };
type Result = { score: number | null; earned: number; possible: number; checks: Check[]; reviews: Review[] };
const columns = 'minmax(140px, 1fr) minmax(180px, 1.4fr) 160px 120px';

const statusNames: Record<string, string> = { passed: 'Выполнено', failed: 'Не выполнено', review: 'На проверке' };

export function Results() {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [opened, setOpened] = useState<Assignment | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [reason, setReason] = useState('');
  const [score, setScore] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Assignment[]>('training/assignments')
      .then((items) => setRows(items.filter((item) => item.attempt_id && ['completed', 'failed'].includes(item.attempt_status ?? ''))))
      .catch((cause: Error) => setError(cause.message));
  }, []);

  async function open(row: Assignment) {
    setOpened(row); setResult(null); setError(''); setReason(''); setScore(''); setRecommendation('');
    try { setResult(await api<Result>(`training/attempts/${row.attempt_id}/result`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Оценка ещё не готова.'); }
  }

  return <Desk title="Результаты">
    {rows.length === 0 ? <DeskEmpty>Результатов нет</DeskEmpty> : <DeskTable columns={columns} head={<><span>Обучающийся</span><span>Сценарий</span><span>Статус</span><span /></>}>
      {rows.map((row) => <DeskRow key={row.attempt_id} columns={columns}>
        <span>{row.learner_login}</span>
        <span>{row.title}</span>
        <span>{attemptNames[row.attempt_status ?? ''] ?? row.attempt_status}</span>
        <span className={deskActions}><button type="button" onClick={() => void open(row)}>Оценка</button></span>
      </DeskRow>)}
    </DeskTable>}
    {error && !opened && <div className={deskError} role="alert">{error}</div>}
    {opened && <ModalForm label={`${opened.learner_login}`}>
<FormCard title={`${opened.learner_login}`} submitLabel="Записать оценку" busy={busy || reason.trim().length < 1}
      error={error} onClose={() => setOpened(null)} onSubmit={() => {
        const expert = Number(score);
        if (!Number.isInteger(expert) || expert < 0 || expert > 100) { setError('Экспертная оценка — целое число от 0 до 100.'); return; }
        setBusy(true); setError('');
        void api(`training/attempts/${opened.attempt_id}/reviews`, { reason, result: { score: expert, recommendation } })
          .then(() => api<Result>(`training/attempts/${opened.attempt_id}/result`))
          .then((next) => { setResult(next); setReason(''); setRecommendation(''); setBusy(false); })
          .catch((cause: Error) => { setError(cause.message); setBusy(false); });
      }}>
      {result && <div>
        <div>{result.score === null ? 'На проверке' : `${result.score} / 100`} · {result.earned} / {result.possible}</div>
        {result.checks.map((check) => <div key={check.id}>
          {check.description} — {statusNames[check.status] ?? check.status}
          {check.status === 'review' && check.actual !== undefined && <div>Ответ: {check.actual || 'не заполнено'}</div>}
          {check.status === 'review' && check.expected !== undefined && <div>Эталон: {check.expected}</div>}
        </div>)}
        {result.reviews.map((item) => <div key={item.created_at}>{item.result.score ?? ''} · {item.reason}{item.result.recommendation ? ` · ${item.result.recommendation}` : ''}</div>)}
      </div>}
      <div className={formGrid}>
        <TextareaField label="Комментарий" value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} />
        <InputField label="Оценка, 0–100" value={score} inputMode="numeric" onChange={(event) => setScore(event.target.value.replace(/\D/g, '').slice(0, 3))} />
        <TextareaField label="Рекомендация" value={recommendation} maxLength={1000} onChange={(event) => setRecommendation(event.target.value)} />
      </div>
    </FormCard>
</ModalForm>}
  </Desk>;
}
