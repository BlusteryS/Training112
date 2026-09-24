import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { attemptNames, lessonNames, type Assignment, type Group, type Lesson, type Scenario } from './types';
import { PanelCard, PanelItemTitle, PanelList, PanelListItem, PanelSubtitle, PanelTitle } from './Panel';

export function Lessons() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [group, setGroup] = useState('');
  const [scenario, setScenario] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function refresh() {
    const [l, a] = await Promise.all([
      api<Lesson[]>('training/lessons'), api<Assignment[]>('training/assignments'),
    ]);
    setLessons(l); setAssignments(a);
  }
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    void Promise.all([api<Group[]>('training/groups'), api<Scenario[]>('training/scenarios')])
      .then(([g, s]) => { if (!cancelled) { setGroups(g); setScenarios(s); } })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    async function poll() {
      try {
        const [l, a] = await Promise.all([
          api<Lesson[]>('training/lessons'), api<Assignment[]>('training/assignments'),
        ]);
        if (!cancelled) { setLessons(l); setAssignments(a); }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Не удалось загрузить занятия.'); }
      if (!cancelled) timer = setTimeout(() => void poll(), 5000);
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);
  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await work(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось изменить занятие.'); }
    finally { setBusy(false); }
  }
  function create(event: FormEvent) {
    event.preventDefault();
    void act(async () => {
      await api<Lesson>('training/lessons', { group_id: group, scenario_id: scenario, mode: 'call' });
      setMessage('Занятие создано. Когда участники будут готовы, нажмите «Открыть приём звонков» в списке ниже.');
    });
  }
  return <div><PanelTitle>Занятия</PanelTitle>
    <p>Выберите группу и утверждённый сценарий. После запуска на доступных рабочих местах участников появятся входящие учебные звонки.</p>
    <form onSubmit={create}><fieldset disabled={busy}><legend>Назначить занятие</legend>
      <p><label>Кому <select required value={group} onChange={(e) => setGroup(e.target.value)}>
        <option value="">Выберите группу</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.member_count} участников)</option>)}
      </select></label></p>
      {!groups.length && <p>Сначала создайте группу и добавьте обучающихся в разделе «Группы».</p>}
      {group && !groups.find((g) => g.id === group)?.member_count && <p>В группе нет участников. Добавьте их в разделе «Группы».</p>}
      <p><label>Сценарий <select required value={scenario} onChange={(e) => setScenario(e.target.value)}>
        <option value="">Выберите сценарий</option>{scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
      </select></label></p>
      {scenario && scenarios.find((s) => s.id === scenario)?.status !== 'approved' && <p>Сценарий ещё не утверждён. Откройте раздел «Сценарии», дождитесь окончания проверки и утвердите его.</p>}
      <button disabled={scenarios.find((s) => s.id === scenario)?.status !== 'approved' || !groups.find((g) => g.id === group)?.member_count}>Создать занятие</button>
    </fieldset></form>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <PanelSubtitle>Назначенные занятия</PanelSubtitle>
    {!lessons.length && <p>Занятий пока нет.</p>}
    {lessons.map((lesson) => <PanelCard key={lesson.id}>
      <PanelItemTitle>{lesson.title} — {lesson.group_name}</PanelItemTitle>
      <p>{lessonNames[lesson.status] ?? lesson.status}.</p>
      {lesson.status === 'planned' && <button disabled={busy} onClick={() => void act(async () => {
        await api(`training/lessons/${lesson.id}/start`, {});
        setMessage('Занятие запущено. На доступных рабочих местах участников появятся входящие звонки с кнопкой «Принять».');
      })}>Открыть приём звонков</button>}
      {lesson.status === 'active' && <>
        <p>Статус участников обновляется каждые 5 секунд. Завершение занятия остановит текущие звонки всех участников.</p>
        <button disabled={busy} onClick={() => void act(async () => {
          await api(`training/lessons/${lesson.id}/finish`, {}); setMessage('Занятие завершено.');
        })}>Завершить занятие для всех</button>
      </>}
      <PanelList>{assignments.filter((a) => a.lesson_id === lesson.id).map((a) => <PanelListItem key={a.id}>
        {a.learner_login} — {a.attempt_status ? attemptNames[a.attempt_status] ?? a.attempt_status : lesson.status === 'completed' ? 'Не приступил' : 'Ожидает приёма звонка'}
      </PanelListItem>)}</PanelList>
    </PanelCard>)}
  </div>;
}
