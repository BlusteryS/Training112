import { useEffect, useState } from 'react';
import { api } from '../api';
import { ActionButton, ActionRow } from '../components/ui/ActionButton';
import { Notice } from '../components/ui/Notice';
import { lessonNames, type Lesson } from './types';
import { PanelCard, PanelTitle } from './Panel';

type ReportRow = {
  learner_login: string;
  attempt_status: string | null;
  elapsed_ms: number | null;
  deadline_seconds: number | null;
  delta_ms: number | null;
  grammar: { field: string; message: string }[];
  evaluation: { score: number | null; checks: { description: string; status: string }[] } | null;
  events: { type: string; count: number }[];
  reviews: { reason: string }[];
};
type Insight = { description: string; failed: number; total: number };
type Progress = { login: string; attempts: number; completed: number; failed: number; average_score: number | null };

function seconds(value: number | null) {
  return value === null ? '—' : `${Math.round(value / 1000)} с`;
}

export function Reports() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lesson, setLesson] = useState('');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([api<Lesson[]>('training/lessons'), api<Insight[]>('training/insights'), api<Progress[]>('training/progress')])
      .then(([lessonRows, insightRows, progressRows]) => { setLessons(lessonRows); setInsights(insightRows); setProgress(progressRows); })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  async function load(id: string) {
    setLesson(id); setError('');
    if (!id) { setRows([]); return; }
    try { setRows(await api<ReportRow[]>(`training/lessons/${id}/report`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось собрать отчёт.'); }
  }

  function download() {
    const header = ['Обучающийся', 'Статус', 'Время', 'Норматив, с', 'Отклонение, с', 'Оценка', 'Ошибки', 'Грамматика', 'Действия', 'Замечания'];
    const lines = rows.map((row) => [
      row.learner_login,
      row.attempt_status ?? 'не приступал',
      seconds(row.elapsed_ms),
      row.deadline_seconds ?? '',
      row.delta_ms === null ? '' : Math.round(row.delta_ms / 1000),
      row.evaluation?.score ?? '',
      (row.evaluation?.checks ?? []).filter((check) => check.status === 'failed').map((check) => check.description).join('; '),
      row.grammar.map((note) => `${note.field}: ${note.message}`).join('; '),
      row.events.map((event) => `${event.type}×${event.count}`).join('; '),
      row.reviews.map((review) => review.reason).join('; '),
    ].map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','));
    const url = URL.createObjectURL(new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lesson-report.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div>
    <PanelTitle>Отчёты и успеваемость</PanelTitle>
    <div><label>Занятие <select value={lesson} onChange={(event) => void load(event.target.value)}>
      <option value="">Выберите занятие</option>
      {lessons.map((item) => <option key={item.id} value={item.id}>{item.title} — {item.group_name} — {lessonNames[item.status]}</option>)}
    </select></label></div>
    {lesson && <ActionRow><ActionButton onClick={download} disabled={!rows.length}>Скачать CSV</ActionButton></ActionRow>}
    {rows.map((row) => <PanelCard key={row.learner_login}>
      <div><span>{row.learner_login}</span> — {row.attempt_status ?? 'не приступал'}. Время {seconds(row.elapsed_ms)}, норматив {row.deadline_seconds ?? '—'} с, отклонение {row.delta_ms === null ? '—' : `${Math.round(row.delta_ms / 1000)} с`}.</div>
      <div>Оценка: {row.evaluation ? (row.evaluation.score ?? 'на проверке') : 'нет'}.</div>
      <div>Ошибки: {(row.evaluation?.checks ?? []).filter((check) => check.status === 'failed').map((check) => check.description).join('; ') || 'нет'}.</div>
      <div>Грамматика: {row.grammar.map((note) => `${note.field}: ${note.message}`).join('; ') || 'замечаний нет'}.</div>
      <div>Действия: {row.events.map((event) => `${event.type} × ${event.count}`).join(', ') || 'нет'}.</div>
    </PanelCard>)}
    <PanelTitle>Прогресс группы</PanelTitle>
    {!progress.length && <div>Назначений пока нет.</div>}
    {progress.map((row) => <div key={row.login}>{row.login}: попыток {row.attempts}, завершено {row.completed}, прервано {row.failed}, средняя оценка {row.average_score ?? '—'}.</div>)}
    <PanelTitle>Типичные ошибки</PanelTitle>
    {!insights.length && <div>Невыполненных критериев пока нет.</div>}
    {insights.map((item) => <div key={item.description}>Разберите критерий «{item.description}»: не выполнено {item.failed} из {item.total}.</div>)}
    {error && <Notice error>{error}</Notice>}
  </div>;
}
