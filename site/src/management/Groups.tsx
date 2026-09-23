import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Group, Learner } from './types';
import { PanelList, PanelListItem, PanelSubtitle, PanelTitle } from './Panel';

export function Groups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [members, setMembers] = useState<Learner[]>([]);
  const [group, setGroup] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [loadedGroup, setLoadedGroup] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function refresh() {
    const [g, u] = await Promise.all([api<Group[]>('training/groups'), api<Learner[]>('training/learners')]);
    setGroups(g); setLearners(u);
  }
  useEffect(() => { void refresh().catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => {
    let cancelled = false;
    setSelected([]); setMembers([]); setLoadedGroup('');
    if (group) void api<Learner[]>(`training/groups/${group}/members`).then((rows) => {
      if (!cancelled) { setMembers(rows); setLoadedGroup(group); }
    }).catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [group]);
  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await work(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить группу.'); }
    finally { setBusy(false); }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void act(async () => {
      const created = await api<Group>('training/groups', Object.fromEntries(data));
      setGroup(created.id); form.reset(); setMessage('Группа создана. Добавьте участников ниже.');
    });
  }
  return <div>
    <PanelTitle>Учебные группы</PanelTitle>
    <p>Группа — список обучающихся, которым вы назначаете одно занятие. Для индивидуального занятия создайте группу с одним участником.</p>
    <form onSubmit={create}><fieldset disabled={busy}><legend>Создать группу</legend>
      <p><label>Название группы <input name="name" required maxLength={200} placeholder="Диспетчеры — сентябрь" /></label></p>
      <p><label>Служба или организация <input name="service_code" required maxLength={64} placeholder="Гормост, жилищная служба, ДДС" /></label></p>
      <button>Создать группу</button>
    </fieldset></form>
    <p><label>Состав группы <select disabled={busy} value={group} onChange={(e) => setGroup(e.target.value)}>
      <option value="">Выберите группу</option>
      {groups.map((g) => <option key={g.id} value={g.id}>{g.name} — {g.service_code} ({g.member_count})</option>)}
    </select></label></p>
    {!groups.length && <p>Групп пока нет.</p>}
    {group && loadedGroup === group && <>
      <PanelSubtitle>Участники ({members.length})</PanelSubtitle>
      <p>Изменения состава применяются к следующим запускам занятий. Уже выданные задания сохраняются.</p>
      {!members.length && <p>В группе пока никого нет. Выберите обучающихся ниже.</p>}
      <PanelList>{members.map((m) => <PanelListItem key={m.id}>{m.login}{m.blocked && ' — доступ заблокирован'}{' '}
        <button disabled={busy} onClick={() => void act(async () => {
          await api(`training/groups/${group}/members/remove`, { learner_id: m.id });
          setMembers(await api<Learner[]>(`training/groups/${group}/members`));
          setMessage('Участник исключён из группы.');
        })}>Исключить {m.login}</button>
      </PanelListItem>)}</PanelList>
      <fieldset disabled={busy}><legend>Добавить обучающихся</legend>
        {!learners.length && <p>Нет доступных учётных записей обучающихся. Их создаёт администратор в разделе «Пользователи системы».</p>}
        {learners.filter((u) => !members.some((m) => m.id === u.id)).map((u) => <p key={u.id}><label>
          <input type="checkbox" checked={selected.includes(u.id)} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, u.id] : ids.filter((id) => id !== u.id))} /> {u.login}
        </label></p>)}
        <button disabled={!selected.length} onClick={() => void act(async () => {
          for (const learner_id of selected) await api(`training/groups/${group}/members`, { learner_id });
          setMembers(await api<Learner[]>(`training/groups/${group}/members`));
          setSelected([]); setMessage('Участники добавлены. Теперь можно назначить занятие.');
        })}>Добавить выбранных ({selected.length})</button>
      </fieldset>
    </>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </div>;
}
