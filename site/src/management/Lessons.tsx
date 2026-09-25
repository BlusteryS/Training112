import { useEffect, useState } from 'react';
import { api } from '../api';
import { ModalForm } from '../components/ModalForm';
import { FormCard, formGrid } from './FormCard';
import { SelectField } from '../components/ui/SelectField';
import { attemptNames, lessonNames, type Assignment, type Group, type Lesson, type Scenario } from './types';
import { Desk, DeskEmpty, DeskRow, DeskTable, deskActions, deskError } from './Desk';

const columns = 'minmax(180px, 1.4fr) minmax(140px, 1fr) 120px 160px 220px';

export function Lessons() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; action: 'start' | 'finish' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    const [nextLessons, nextAssignments] = await Promise.all([api<Lesson[]>('training/lessons'), api<Assignment[]>('training/assignments')]);
    setLessons(nextLessons);
    setAssignments(nextAssignments);
  }
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    void Promise.all([api<Group[]>('training/groups'), api<Scenario[]>('training/scenarios')])
      .then(([nextGroups, nextScenarios]) => { if (!cancelled) { setGroups(nextGroups); setScenarios(nextScenarios); } })
      .catch((cause: Error) => { if (!cancelled) setError(cause.message); });
    async function poll() {
      try { if (!cancelled) await refresh(); }
      catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить занятия.'); }
      if (!cancelled) timer = setTimeout(() => void poll(), 5000);
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  const approved = scenarios.filter((item) => item.status === 'approved');
  return <Desk title="Занятия" actions={<button type="button" onClick={() => { setError(''); setCreating(true); }}>Назначить</button>}>
    {lessons.length === 0 ? <DeskEmpty>Занятий нет</DeskEmpty> : <DeskTable columns={columns} head={<><span>Сценарий</span><span>Группа</span><span>Режим</span><span>Статус</span><span /></>}>
      {lessons.map((lesson) => <DeskRow key={lesson.id} columns={columns}>
        <span>{lesson.title}</span>
        <span>{lesson.group_name}</span>
        <span>{lesson.mode === 'card' ? 'Карточка' : 'Звонок'}</span>
        <span>{lessonNames[lesson.status] ?? lesson.status}</span>
        <span className={deskActions}>
          {lesson.status === 'planned' && <button type="button" onClick={() => setConfirm({ id: lesson.id, action: 'start' })}>Запустить</button>}
          {lesson.status === 'active' && <button type="button" onClick={() => setConfirm({ id: lesson.id, action: 'finish' })}>Завершить</button>}
        </span>
      </DeskRow>)}
    </DeskTable>}
    {lessons.some((lesson) => lesson.status === 'active') && assignments.some((item) => lessons.some((lesson) => lesson.status === 'active' && lesson.id === item.lesson_id)) &&
      <DeskTable columns="minmax(0, 1fr) minmax(0, 1fr) 220px" head={<><span>Участник</span><span>Занятие</span><span>Сейчас</span></>}>
        {assignments.filter((item) => lessons.some((lesson) => lesson.status === 'active' && lesson.id === item.lesson_id)).map((item) => <DeskRow key={item.id} columns="minmax(0, 1fr) minmax(0, 1fr) 220px">
          <span>{item.learner_login}</span>
          <span>{item.title}</span>
          <span>{item.attempt_status ? attemptNames[item.attempt_status] ?? item.attempt_status : 'Ожидает'}</span>
        </DeskRow>)}
      </DeskTable>}
    {error && <div className={deskError} role="alert">{error}</div>}
    {creating && <LessonCreate groups={groups} scenarios={approved} busy={busy} onClose={() => setCreating(false)} onSubmit={(groupId, scenarioId, mode) => {
      setBusy(true); setError('');
      void api('training/lessons', { group_id: groupId, scenario_id: scenarioId, mode })
        .then(async () => { await refresh(); setCreating(false); })
        .catch((cause: Error) => setError(cause.message))
        .finally(() => setBusy(false));
    }} />}
    {confirm && <ModalForm label={confirm.action === 'start' ? 'Запустить занятие' : 'Завершить занятие'}>
<FormCard title={confirm.action === 'start' ? 'Запустить занятие' : 'Завершить занятие'}
      submitLabel={confirm.action === 'start' ? 'Запустить' : 'Завершить'} busy={busy} onClose={() => setConfirm(null)} onSubmit={() => {
        setBusy(true); setError('');
        void api(`training/lessons/${confirm.id}/${confirm.action === 'start' ? 'start' : 'finish'}`, {})
          .then(async () => { await refresh(); setConfirm(null); })
          .catch((cause: Error) => setError(cause.message))
          .finally(() => setBusy(false));
      }}></FormCard>
    </ModalForm>}
  </Desk>;
}

function LessonCreate({ groups, scenarios, busy, onClose, onSubmit }: {
  groups: Group[];
  scenarios: Scenario[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (groupId: string, scenarioId: string, mode: string) => void;
}) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id ?? '');
  const [mode, setMode] = useState('call');
  const ready = Boolean(groupId && scenarioId && groups.find((item) => item.id === groupId)?.member_count);
  return <ModalForm label="Занятие">
<FormCard title="Занятие" submitLabel="Назначить" busy={busy || !ready} onClose={onClose} onSubmit={() => onSubmit(groupId, scenarioId, mode)}>
    <div className={formGrid}>
      <SelectField label="Группа" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
        {groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </SelectField>
      <SelectField label="Сценарий" value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
        {scenarios.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </SelectField>
      <SelectField label="Режим" value={mode} onChange={(event) => setMode(event.target.value)}>
        <option value="call">Звонок оператора 112</option>
        <option value="card">Отработка карточки</option>
      </SelectField>
    </div>
  </FormCard>
</ModalForm>;
}
