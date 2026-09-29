import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { WorkspaceHeader } from '../components/shell/WorkspaceHeader';
import { Desk, DeskEmpty, DeskRow, DeskTable, deskPlaceholder, deskError } from '../management/Desk';
import shell from '../App.module.css';
import styles from './LearnerProgress.module.css';

type Check = { description: string; status: string };
type History = {
  attempt_id: string;
  title: string;
  mode: string;
  status: string;
  finished_at: string;
  score: number | null;
  checks: Check[];
  recommendations: string[];
};


export function LearnerProgress() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<History[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<History[]>('training/history').then(setRows).catch((cause: Error) => setError(cause.message));
  }, []);
  const scored = rows.filter((row) => row.status === 'completed' && row.score !== null);
  const mean = scored.length ? Math.round(scored.reduce((total, row) => total + row.score!, 0) / scored.length) : null;
  const mistakes = rows.filter((row) => row.status === 'completed')
    .flatMap((row) => row.checks.filter((check) => check.status === 'failed'));
  return <div className={shell.workspace}>
    <WorkspaceHeader leading={<div className={shell.searchPanel}><div className={shell.staffTitle}>Мои результаты</div></div>} />
    <div className={styles.content}>
      <Desk title="Прогресс" actions={<button type="button" onClick={() => navigate('/')}>К происшествиям</button>}>
        <div className={styles.summary}>
          <div>Завершённых карточек: {rows.filter((row) => row.status === 'completed').length}</div>
          <div>Средняя оценка: {mean === null ? '—' : `${mean} / 100`}</div>
          <div>Ошибок по критериям: {mistakes.length}</div>
        </div>
        {rows.length === 0 ? <DeskEmpty>Истории занятий пока нет</DeskEmpty> :
          <DeskTable head={<><span>Карточка</span><span>Дата</span><span>Результат</span><span>Оценка</span><span>Ошибки и рекомендации</span></>}>
            {rows.map((row) => <DeskRow key={row.attempt_id}>
              <span>{row.title}</span>
              <span>{new Date(row.finished_at).toLocaleString('ru-RU')}</span>
              <span>{row.status === 'completed' ? 'Завершена' : 'Прервана'}</span>
              <span className={row.status === 'failed' ? deskPlaceholder : undefined}>{row.status === 'failed' ? '—' : row.score === null ? 'На проверке' : row.score}</span>
              <span>{row.status === 'failed' ? 'Занятие прервано до сохранения карточки'
                : row.checks.filter((check) => check.status === 'failed').map((check) => check.description).join('; ')
                  || row.recommendations.join('; ') || 'Ошибок нет'}</span>
            </DeskRow>)}
          </DeskTable>}
        {error && <div className={deskError} role="alert">{error}</div>}
      </Desk>
    </div>
  </div>;
}
