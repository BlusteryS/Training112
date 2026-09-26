import { useEffect, useState } from 'react';
import { api } from '../api';
import { lessonNames, type Lesson } from './types';
import { ChoiceSelect } from '../components/ChoiceSelect';
import { Desk, DeskEmpty, DeskRow, DeskSection, DeskTable, deskError } from './Desk';

type ReportRow = {
  attempt_id: string | null;
  card_title: string | null;
  learner_login: string;
  mode: string;
  attempt_status: string | null;
  elapsed_ms: number | null;
  primary_elapsed_ms: number | null;
  deadline_seconds: number | null;
  delta_ms: number | null;
  grammar: { field: string; message: string }[];
  evaluation: { score: number | null; checks: { description: string; status: string }[] } | null;
  events: { type: string; count: number }[];
  reviews: { reason: string }[];
};
type Insight = { id: string; kind: string; description: string; failed: number; review: number; total: number };
type Progress = { login: string; attempts: number; completed: number; failed: number; average_score: number | null };

function seconds(value: number | null) {
  return value === null ? '' : String(Math.round(value / 1000));
}

function recommendation(item: Insight) {
  if (item.kind === 'semantic') return 'Разберите, какие сведения заявителя нужно сохранить в описании.';
  if (item.id === 'address') return 'Отработайте уточнение улицы, дома и места происшествия.';
  if (item.id === 'incident_code') return 'Сравните выбранный тип с описанной обстановкой.';
  if (item.id === 'caller_name') return 'Отработайте запрос имени заявителя.';
  if (item.kind === 'deadline') return 'Проведите тренировку с ограничением времени.';
  return `Повторите действие: ${item.description}`;
}

export function Reports() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lesson, setLesson] = useState('');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [error, setError] = useState('');
  const columns = 'minmax(140px, 1fr) minmax(180px, 1.4fr) minmax(120px, .8fr) 80px 80px 100px 80px minmax(160px, 1.3fr) minmax(160px, 1.3fr)';

  useEffect(() => {
    void Promise.all([api<Lesson[]>('training/lessons'), api<Insight[]>('training/insights'), api<Progress[]>('training/progress')])
      .then(([lessonRows, insightRows, progressRows]) => { setLessons(lessonRows); setInsights(insightRows); setProgress(progressRows); })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  function download() {
    const header = ['Обучающийся', 'Карточка', 'Статус', 'Время, с', 'Норматив, с', 'Отклонение, с', 'Оценка', 'Ошибки', 'Грамматика', 'Действия', 'Замечания'];
    const lines = rows.map((row) => [
      row.learner_login, row.card_title ?? '', row.attempt_status ?? '', seconds(row.mode === 'card' ? row.primary_elapsed_ms : row.elapsed_ms), row.deadline_seconds ?? '',
      row.delta_ms === null ? '' : Math.round(row.delta_ms / 1000), row.evaluation?.score ?? '',
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

  return <Desk title="Отчёты" actions={<>
    <ChoiceSelect label="Занятие" value={lesson} onChange={(id) => {
      setLesson(id); setError('');
      if (!id) { setRows([]); return; }
      void api<ReportRow[]>(`training/lessons/${id}/report`).then(setRows).catch((cause: Error) => setError(cause.message));
    }}>
      <option value="">Выберите занятие</option>
      {lessons.map((item) => <option key={item.id} value={item.id}>{item.title} — {lessonNames[item.status]}</option>)}
    </ChoiceSelect>
    {rows.length > 0 && <button type="button" onClick={download}>CSV</button>}
  </>}>
    {lessons.length === 0 && <DeskEmpty>Занятий нет</DeskEmpty>}
    {lesson && rows.length === 0 && <DeskEmpty>По занятию записей нет</DeskEmpty>}
    {rows.length > 0 && <DeskSection title="Результаты занятия"><DeskTable columns={columns} minWidth={1320} head={<><span>Обучающийся</span><span>Карточка</span><span>Статус</span><span>Время</span><span>Норма</span><span>Отклонение</span><span>Оценка</span><span>Ошибки</span><span>Текст</span></>}>
      {rows.map((row) => <DeskRow key={row.attempt_id ?? row.learner_login}>
        <span>{row.learner_login}</span>
        <span>{row.card_title ?? ''}</span>
        <span>{row.attempt_status ?? ''}</span>
        <span>{seconds(row.mode === 'card' ? row.primary_elapsed_ms : row.elapsed_ms)}</span>
        <span>{row.deadline_seconds ?? ''}</span>
        <span>{row.delta_ms === null ? '' : Math.round(row.delta_ms / 1000)}</span>
        <span>{row.evaluation?.score ?? ''}</span>
        <span>{(row.evaluation?.checks ?? []).filter((check) => check.status === 'failed').map((check) => check.description).join('; ')}</span>
        <span>{row.grammar.map((note) => note.message).join('; ')}</span>
      </DeskRow>)}
    </DeskTable></DeskSection>}
    {progress.length > 0 && <DeskSection title="Динамика обучающихся"><DeskTable columns="minmax(140px, 1fr) 100px 120px 100px 140px" head={<><span>Обучающийся</span><span>Попытки</span><span>Завершено</span><span>Прервано</span><span>Средняя оценка</span></>}>
      {progress.map((row) => <DeskRow key={row.login}>
        <span>{row.login}</span><span>{row.attempts}</span><span>{row.completed}</span><span>{row.failed}</span><span>{row.average_score ?? ''}</span>
      </DeskRow>)}
    </DeskTable></DeskSection>}
    {insights.length > 0 && <DeskSection title="Частые ошибки"><DeskTable columns="minmax(160px, 1fr) 120px 120px 90px minmax(240px, 1.4fr)" head={<><span>Критерий</span><span>Ошибки</span><span>На проверке</span><span>Всего</span><span>Что отработать</span></>}>
      {insights.map((item) => <DeskRow key={`${item.id}-${item.description}`}>
        <span>{item.description}</span><span>{item.failed}</span><span>{item.review}</span><span>{item.total}</span><span>{recommendation(item)}</span>
      </DeskRow>)}
    </DeskTable></DeskSection>}
    {error && <div className={deskError} role="alert">{error}</div>}
  </Desk>;
}
