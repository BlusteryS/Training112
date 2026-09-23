import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { attemptNames, difficultyNames, type Assignment } from '../management/types';

export function Assignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const rows = await api<Assignment[]>('training/assignments');
        if (!cancelled) { setAssignments(rows); setError(''); }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Не удалось загрузить задания.'); }
      finally { if (!cancelled) { setLoading(false); timer = setTimeout(() => void read(), 5000); } }
    }
    void read();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);
  const active = assignments.filter((a) => a.status === 'active' && a.mode === 'call');
  return <section><h2>Мои задания</h2>
    <p>Наденьте гарнитуру и выберите назначенный звонок. Разрешите браузеру доступ к микрофону, выслушайте заявителя и уточните обстоятельства происшествия.</p>
    {loading && <p role="status">Загружаем задания…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !active.length && <p>Сейчас нет открытых заданий на звонок. Преподаватель должен добавить вас в группу и запустить занятие. Список обновляется автоматически.</p>}
    {active.map((a) => <article key={a.id}>
      <h3>{a.title}</h3><p>Группа: {a.group_name}. Уровень: {difficultyNames[a.difficulty ?? 'basic'] ?? a.difficulty}.</p>
      {a.instructions && <p>{a.instructions}</p>}
      {a.attempt_status && <p>Последняя попытка: {attemptNames[a.attempt_status] ?? a.attempt_status}.</p>}
      <Link to={`/session?assignment_id=${encodeURIComponent(a.id)}`}>{a.attempt_status && ['created', 'active', 'suspended'].includes(a.attempt_status) ? 'Открыть текущую попытку' : a.attempt_status ? 'Повторить учебный звонок' : 'Принять учебный звонок'}</Link>
    </article>)}
  </section>;
}
