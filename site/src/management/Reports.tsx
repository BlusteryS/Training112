import { useEffect, useState } from 'react';
import { api } from '../api';
import { lessonNames, type Lesson } from './types';
import { ChoiceSelect } from '../components/ChoiceSelect';
import { Desk, DeskEmpty, DeskRow, DeskTable, deskError } from './Desk';

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
  return value === null ? '' : String(Math.round(value / 1000));
}

export function Reports() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lesson, setLesson] = useState('');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [error, setError] = useState('');
  const columns = '140px 120px 70px 70px 90px 70px minmax(140px, 1fr) minmax(140px, 1fr)';

  useEffect(() => {
    void Promise.all([api<Lesson[]>('training/lessons'), api<Insight[]>('training/insights'), api<Progress[]>('training/progress')])
      .then(([lessonRows, insightRows, progressRows]) => { setLessons(lessonRows); setInsights(insightRows); setProgress(progressRows); })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  function download() {
    const header = ['Обучающийся', 'Статус', 'Время, с', 'Норматив, с', 'Отклонение, с', 'Оценка', 'Ошибки', 'Грамматика', 'Действия', 'Замечания'];
    const lines = rows.map((row) => [
      row.learner_login, row.attempt_status ?? '', seconds(row.elapsed_ms), row.deadline_seconds ?? '',
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
    {rows.length > 0 && <DeskTable columns={columns} head={<><span>Обучающийся</span><span>Статус</span><span>Время</span><span>Норма</span><span>Отклонение</span><span>Оценка</span><span>Ошибки</span><span>Текст</span></>}>
      {rows.map((row) => <DeskRow key={row.learner_login} columns={columns}>
        <span>{row.learner_login}</span>
        <span>{row.attempt_status ?? ''}</span>
        <span>{seconds(row.elapsed_ms)}</span>
        <span>{row.deadline_seconds ?? ''}</span>
        <span>{row.delta_ms === null ? '' : Math.round(row.delta_ms / 1000)}</span>
        <span>{row.evaluation?.score ?? ''}</span>
        <span>{(row.evaluation?.checks ?? []).filter((check) => check.status === 'failed').map((check) => check.description).join('; ')}</span>
        <span>{row.grammar.map((note) => note.message).join('; ')}</span>
      </DeskRow>)}
    </DeskTable>}
    {progress.length > 0 && <DeskTable columns="minmax(140px, 1fr) 100px 120px 100px 140px" head={<><span>Обучающийся</span><span>Попытки</span><span>Завершено</span><span>Прервано</span><span>Средняя оценка</span></>}>
      {progress.map((row) => <DeskRow key={row.login} columns="minmax(140px, 1fr) 100px 120px 100px 140px">
        <span>{row.login}</span><span>{row.attempts}</span><span>{row.completed}</span><span>{row.failed}</span><span>{row.average_score ?? ''}</span>
      </DeskRow>)}
    </DeskTable>}
    {insights.length > 0 && <DeskTable columns="minmax(0, 1fr) 120px 100px" head={<><span>Критерий</span><span>Не выполнено</span><span>Всего</span></>}>
      {insights.map((item) => <DeskRow key={item.description} columns="minmax(0, 1fr) 120px 100px">
        <span>{item.description}</span><span>{item.failed}</span><span>{item.total}</span>
      </DeskRow>)}
    </DeskTable>}
    {error && <div className={deskError} role="alert">{error}</div>}
  </Desk>;
}
