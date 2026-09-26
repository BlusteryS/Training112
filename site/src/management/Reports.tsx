import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { downloadFile } from '../download';
import { attemptNames, lessonNames, type Lesson } from './types';
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
  return value == null ? '' : String(Math.round(value / 1000));
}

function reportStatus(row: ReportRow) {
  return attemptNames[row.attempt_status ?? ''] ?? row.attempt_status ?? '';
}

function reportElapsed(row: ReportRow) {
  return seconds(row.mode === 'card' ? row.primary_elapsed_ms : row.elapsed_ms);
}

function reportDelta(row: ReportRow) {
  return row.delta_ms == null ? '' : Math.round(row.delta_ms / 1000);
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
  const [reportReady, setReportReady] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [error, setError] = useState('');
  const reportRequest = useRef<AbortController | null>(null);

  useEffect(() => () => reportRequest.current?.abort(), []);

  useEffect(() => {
    void Promise.all([api<Lesson[]>('training/lessons'), api<Insight[]>('training/insights'), api<Progress[]>('training/progress')])
      .then(([lessonRows, insightRows, progressRows]) => { setLessons(lessonRows); setInsights(insightRows); setProgress(progressRows); })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  function download() {
    const header = ['Обучающийся', 'Карточка', 'Статус', 'Время, с', 'Норматив, с', 'Отклонение, с', 'Оценка', 'Ошибки', 'Грамматика', 'Действия', 'Замечания'];
    const lines = rows.map((row) => [
      row.learner_login, row.card_title ?? '', reportStatus(row), reportElapsed(row), row.deadline_seconds ?? '',
      reportDelta(row), row.evaluation?.score ?? '',
      (row.evaluation?.checks ?? []).filter((check) => check.status === 'failed').map((check) => check.description).join('; '),
      row.grammar.map((note) => `${note.field}: ${note.message}`).join('; '),
      row.events.map((event) => `${event.type}×${event.count}`).join('; '),
      row.reviews.map((review) => review.reason).join('; '),
    ].map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','));
    downloadFile(new Blob(['\uFEFF', [header.join(','), ...lines].join('\n')],
      { type: 'text/csv;charset=utf-8' }), 'lesson-report.csv');
  }

  return <Desk actions={<>
    <ChoiceSelect label="Занятие" value={lesson} onChange={(id) => {
      reportRequest.current?.abort();
      setLesson(id); setRows([]); setReportReady(false); setError('');
      if (!id) return;
      const controller = new AbortController();
      reportRequest.current = controller;
      void api<ReportRow[]>(`training/lessons/${id}/report`, undefined, controller.signal)
        .then((result) => { if (!controller.signal.aborted) { setRows(result); setReportReady(true); } })
        .catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); });
    }}>
      <option value="">Выберите занятие</option>
      {lessons.map((item) => <option key={item.id} value={item.id}>{item.title} — {lessonNames[item.status]}</option>)}
    </ChoiceSelect>
    {rows.length > 0 && <button type="button" onClick={download}>CSV</button>}
  </>}>
    {lessons.length === 0 && <DeskEmpty>Занятий нет</DeskEmpty>}
    {lesson && reportReady && rows.length === 0 && <DeskEmpty>По занятию записей нет</DeskEmpty>}
    {rows.length > 0 && <DeskSection title="Результаты занятия"><DeskTable head={<><span>Обучающийся</span><span>Карточка</span><span>Статус</span><span>Время, с</span><span>Норма, с</span><span>Отклонение, с</span><span>Оценка</span><span>Ошибки</span><span>Грамматика</span></>}>
      {rows.map((row) => <DeskRow key={row.attempt_id ?? row.learner_login}>
        <span>{row.learner_login}</span>
        <span>{row.card_title ?? ''}</span>
        <span>{reportStatus(row)}</span>
        <span>{reportElapsed(row)}</span>
        <span>{row.deadline_seconds ?? ''}</span>
        <span>{reportDelta(row)}</span>
        <span>{row.evaluation?.score ?? ''}</span>
        <span>{(row.evaluation?.checks ?? []).filter((check) => check.status === 'failed').map((check) => check.description).join('; ')}</span>
        <span>{row.grammar.map((note) => note.message).join('; ')}</span>
      </DeskRow>)}
    </DeskTable></DeskSection>}
    {progress.length > 0 && <DeskSection title="Динамика обучающихся"><DeskTable head={<><span>Обучающийся</span><span>Попытки</span><span>Завершено</span><span>Прервано</span><span>Средняя оценка</span></>}>
      {progress.map((row) => <DeskRow key={row.login}>
        <span>{row.login}</span><span>{row.attempts}</span><span>{row.completed}</span><span>{row.failed}</span><span>{row.average_score ?? ''}</span>
      </DeskRow>)}
    </DeskTable></DeskSection>}
    {insights.length > 0 && <DeskSection title="Частые ошибки"><DeskTable head={<><span>Критерий</span><span>Ошибки</span><span>На проверке</span><span>Всего</span><span>Что отработать</span></>}>
      {insights.map((item) => <DeskRow key={`${item.id}-${item.description}`}>
        <span>{item.description}</span><span>{item.failed}</span><span>{item.review}</span><span>{item.total}</span><span>{recommendation(item)}</span>
      </DeskRow>)}
    </DeskTable></DeskSection>}
    {error && <div className={deskError} role="alert">{error}</div>}
  </Desk>;
}
