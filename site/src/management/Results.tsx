import { useEffect, useState } from 'react';
import { api } from '../api';
import { ActionButton } from '../components/ui/ActionButton';
import { Field } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { attemptNames, type Assignment } from './types';
import { PanelCard, PanelItemTitle, PanelTitle } from './Panel';

type Check = { id: string; description: string; status: string; weight: number; actual?: unknown; expected?: unknown };
type Evaluation = { score: number | null; requires_review: boolean; earned: number; possible: number; checks: Check[] };
type Review = { reason: string; result: { score?: number; recommendation?: string }; created_at: string };
type Result = Evaluation & { reviews: Review[] };

export function Results() {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [reason, setReason] = useState('');
  const [score, setScore] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Assignment[]>('training/assignments').then((items) => setRows(items.filter((item) => item.attempt_id
      && ['completed', 'failed'].includes(item.attempt_status ?? ''))))
      .catch((cause: Error) => setError(cause.message));
  }, []);

  async function open(id: string) {
    setSelected(id); setError(''); setMessage(''); setResult(null);
    try { setResult(await api<Result>(`training/attempts/${id}/result`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Оценка ещё не готова.'); }
  }

  async function review() {
    if (!selected || busy) return;
    const expert = Number(score);
    if (!Number.isInteger(expert) || expert < 0 || expert > 100) {
      setError('Экспертная оценка — целое число от 0 до 100.');
      return;
    }
    setBusy(true); setError('');
    try {
      await api(`training/attempts/${selected}/reviews`, {
        reason, result: { score: expert, recommendation },
      });
      setReason(''); setRecommendation('');
      setResult(await api<Result>(`training/attempts/${selected}/result`));
      setMessage('Экспертная оценка записана в журнал. Предыдущие оценки сохраняются.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось записать оценку.');
    } finally { setBusy(false); }
  }

  return <div>
    <PanelTitle>Результаты и обратная связь</PanelTitle>
    <div>Автоматическая оценка сравнивает карточку с эталоном. Экспертная оценка дописывается отдельно и не затирает автоматическую.</div>
    {!rows.length && <div>Завершённых попыток пока нет.</div>}
    {rows.map((row) => <PanelCard key={row.attempt_id}>
      <PanelItemTitle>{row.learner_login} — {row.title}</PanelItemTitle>
      <div>{attemptNames[row.attempt_status ?? ''] ?? row.attempt_status}. Сложность: {row.difficulty ?? 'не задана'}.</div>
      <ActionButton onClick={() => void open(row.attempt_id ?? '')}>Показать оценку</ActionButton>
      {selected === row.attempt_id && result && <>
        <div>Автоматическая оценка: {result.score === null ? 'нужна проверка' : `${result.score} из 100`} ({result.earned} из {result.possible}).</div>
        <div>{result.checks.map((check) => <div key={check.id}>{check.description}: {check.status === 'passed' ? 'выполнено' : check.status === 'failed' ? 'не выполнено' : 'на проверке'}</div>)}</div>
        {result.reviews.map((item, index) => <div key={item.created_at + index}>
          Экспертная оценка {item.result.score ?? '—'}. {item.reason} {item.result.recommendation ? `Рекомендация: ${item.result.recommendation}` : ''}
        </div>)}
        <Field label="Комментарий к результату"><textarea value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} /></Field>
        <Field label="Экспертная оценка, 0–100"><input value={score} inputMode="numeric" onChange={(event) => setScore(event.target.value.replace(/\D/g, '').slice(0, 3))} /></Field>
        <Field label="Рекомендация обучающемуся"><textarea value={recommendation} maxLength={1000} onChange={(event) => setRecommendation(event.target.value)} /></Field>
        <ActionButton disabled={busy || reason.trim().length < 1} onClick={() => void review()}>Записать экспертную оценку</ActionButton>
      </>}
    </PanelCard>)}
    {error && <Notice error>{error}</Notice>}
    {message && <Notice>{message}</Notice>}
  </div>;
}
