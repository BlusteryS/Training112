import { useEffect, useState } from 'react';
import { api } from '../api';
import { ModalForm } from '../components/ModalForm';
import { FormCard, formCheck, formGrid } from './FormCard';
import { InputField } from '../components/ui/InputField';
import type { Group, Learner } from './types';
import { Desk, DeskEmpty, DeskRow, DeskTable, deskActions, deskError } from './Desk';

const columns = 'minmax(180px, 1fr) minmax(140px, 1fr) 120px 120px';

export function Groups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [members, setMembers] = useState<Learner[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    const [nextGroups, nextLearners] = await Promise.all([api<Group[]>('training/groups'), api<Learner[]>('training/learners')]);
    setGroups(nextGroups);
    setLearners(nextLearners);
    setGroup((current) => nextGroups.find((item) => item.id === current?.id) ?? null);
  }
  useEffect(() => { void refresh().catch((cause: Error) => setError(cause.message)); }, []);
  useEffect(() => {
    if (!group) { setMembers([]); return; }
    let cancelled = false;
    void api<Learner[]>(`training/groups/${group.id}/members`).then((rows) => { if (!cancelled) setMembers(rows); })
      .catch((cause: Error) => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, [group?.id]);

  const people = [...learners];
  for (const member of members) {
    if (!people.some((learner) => learner.id === member.id)) people.push(member);
  }

  async function toggle(learnerId: string, on: boolean) {
    if (!group || busy) return;
    const previous = members;
    const person = people.find((learner) => learner.id === learnerId);
    setMembers(on
      ? person && !previous.some((learner) => learner.id === learnerId) ? [...previous, person] : previous
      : previous.filter((learner) => learner.id !== learnerId));
    setBusy(true);
    setError('');
    try {
      await api(on ? `training/groups/${group.id}/members` : `training/groups/${group.id}/members/remove`, { learner_id: learnerId });
      setMembers(await api<Learner[]>(`training/groups/${group.id}/members`));
      await refresh();
    } catch (cause) {
      setMembers(previous);
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить состав.');
    } finally {
      setBusy(false);
    }
  }
  return <Desk title="Группы" actions={<button type="button" onClick={() => { setError(''); setCreating(true); }}>Создать</button>}>
    {groups.length === 0 ? <DeskEmpty>Групп нет</DeskEmpty> : <DeskTable columns={columns} head={<><span>Название</span><span>Служба</span><span>Участники</span><span /></>}>
      {groups.map((item) => <DeskRow key={item.id} columns={columns}>
        <span>{item.name}</span>
        <span>{item.service_code}</span>
        <span>{item.member_count}</span>
        <span className={deskActions}><button type="button" onClick={() => { setError(''); setGroup(item); }}>Состав</button></span>
      </DeskRow>)}
    </DeskTable>}
    {error && !group && <div className={deskError} role="alert">{error}</div>}
    {creating && <GroupCreate busy={busy} onClose={() => setCreating(false)} onSubmit={(name, service) => {
      setBusy(true); setError('');
      void api<Group>('training/groups', { name, service_code: service })
        .then(async (created) => { await refresh(); setGroup(created); setCreating(false); })
        .catch((cause: Error) => setError(cause.message))
        .finally(() => setBusy(false));
    }} />}
    {group && <ModalForm label={group.name}>
      <FormCard title={group.name} error={error} onClose={() => setGroup(null)}>
        {people.length === 0 ? <div>Пользователей нет</div> : <div className={formGrid}>
          {people.map((learner) => <label className={formCheck} key={learner.id}>
            <input type="checkbox" checked={members.some((member) => member.id === learner.id)} disabled={busy} onChange={(event) => void toggle(learner.id, event.target.checked)} />
            <span>{learner.login}{learner.blocked ? ' · доступ закрыт' : ''}</span>
          </label>)}
        </div>}
      </FormCard>
    </ModalForm>}
  </Desk>;
}

function GroupCreate({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (name: string, service: string) => void }) {
  const [name, setName] = useState('');
  const [service, setService] = useState('');
  return <ModalForm label="Новая группа">
<FormCard title="Новая группа" submitLabel="Создать" busy={busy} onClose={onClose} onSubmit={() => onSubmit(name, service)}>
    <div className={formGrid}>
      <InputField label="Название" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
      <InputField label="Служба" value={service} maxLength={64} onChange={(event) => setService(event.target.value)} />
    </div>
  </FormCard>
</ModalForm>;
}
