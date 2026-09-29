import { useEffect, useState } from 'react';
import { api } from '../api';
import { ModalForm } from '../components/ModalForm';
import { FormCard, formCheck, formGrid } from './FormCard';
import { SelectField } from '../components/ui/SelectField';
import { InputField } from '../components/ui/InputField';
import { TextareaField } from '../components/ui/TextareaField';
import { attemptNames, difficultyNames, lessonNames, type Assignment, type Group, type Lesson, type Scenario, type TrainingModule } from './types';
import { ModuleCreate } from './ModuleCreate';
import { Desk, DeskEmpty, DeskRow, DeskSection, DeskTable, deskInlineActions, deskError } from './Desk';
import styles from './LessonCreate.module.css';

type OperatorCard = { id: string; incident_code: string; address: string; services: string; created_at: string };

export function Lessons() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [operatorCards, setOperatorCards] = useState<OperatorCard[]>([]);
  const [creating, setCreating] = useState(false);
  const [creatingModule, setCreatingModule] = useState(false);
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
    void Promise.all([api<Group[]>('training/groups'), api<TrainingModule[]>('training/modules'), api<Scenario[]>('training/scenarios'),
      api<OperatorCard[]>('training/operator-cards')])
      .then(([nextGroups, nextModules, nextScenarios, cards]) => { if (!cancelled) {
        setGroups(nextGroups); setModules(nextModules); setScenarios(nextScenarios); setOperatorCards(cards);
      } })
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
  const activeLessons = new Set(lessons.filter((lesson) => lesson.status === 'active').map((lesson) => lesson.id));
  const activeAssignments = assignments.filter((item) => activeLessons.has(item.lesson_id));
  return <Desk actions={<><button type="button" disabled={!groups.length} onClick={() => setCreatingModule(true)}>Создать модуль</button>
    <button type="button" disabled={!modules.length} onClick={() => { setError(''); setCreating(true); }}>Назначить</button></>}>
    {modules.length > 0 && <DeskSection title="Учебные модули"><DeskTable head={<><span>Модуль</span><span>Группа</span><span>Сложность</span><span>Занятий</span></>}>
      {modules.map((module) => <DeskRow key={module.id}><span>{module.title}</span><span>{module.group_name}</span>
        <span>{difficultyNames[module.difficulty] ?? module.difficulty}</span>
        <span>{lessons.filter((lesson) => lesson.module_id === module.id).length}</span></DeskRow>)}
    </DeskTable></DeskSection>}
    {lessons.length === 0 ? <DeskEmpty>Занятий нет</DeskEmpty> : <DeskTable head={<><span>Сценарий или карточка</span><span>Модуль</span><span>Группа</span><span>Режим</span><span>Статус</span></>}>
      {lessons.map((lesson) => <DeskRow key={lesson.id}>
        <span>{lesson.title}</span>
        <span>{lesson.module_title ?? '—'}</span>
        <span>{lesson.group_name}</span>
        <span>{lesson.mode === 'card' ? 'Карточка' : 'Звонок'}</span>
        <span className={deskInlineActions}>
          <span>{lessonNames[lesson.status] ?? lesson.status}</span>
          {lesson.status === 'planned' && <button type="button" onClick={() => setConfirm({ id: lesson.id, action: 'start' })}>Запустить</button>}
          {lesson.status === 'active' && <button type="button" onClick={() => setConfirm({ id: lesson.id, action: 'finish' })}>Завершить</button>}
        </span>
      </DeskRow>)}
    </DeskTable>}
    {activeAssignments.length > 0 &&
      <DeskSection title="Ход занятий"><DeskTable head={<><span>Обучающийся</span><span>Занятие</span><span>Состояние</span></>}>
        {activeAssignments.map((item) => <DeskRow key={item.id}>
          <span>{item.learner_login}</span>
          <span>{item.title}</span>
          <span>{item.attempt_status ? attemptNames[item.attempt_status] ?? item.attempt_status : 'Ожидает'}</span>
        </DeskRow>)}
      </DeskTable></DeskSection>}
    {error && <div className={deskError} role="alert">{error}</div>}
    {creatingModule && <ModuleCreate groups={groups} onClose={() => setCreatingModule(false)} onCreated={(module) => {
      setModules((current) => [module, ...current]); setCreatingModule(false);
    }} />}
    {creating && <LessonCreate groups={groups} modules={modules} scenarios={approved} operatorCards={operatorCards} busy={busy}
      error={error} onClose={() => setCreating(false)} onSubmit={(body) => {
      setBusy(true); setError('');
      void api('training/lessons', body)
        .then(async () => { await refresh(); setCreating(false); })
        .catch((cause: Error) => setError(cause.message))
        .finally(() => setBusy(false));
    }} />}
    {confirm && <ModalForm label={confirm.action === 'start' ? 'Запустить занятие' : 'Завершить занятие'} onClose={() => setConfirm(null)}>
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

function LessonCreate({ groups, modules, scenarios, operatorCards, busy, error, onClose, onSubmit }: {
  groups: Group[];
  modules: TrainingModule[];
  scenarios: Scenario[];
  operatorCards: OperatorCard[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [moduleId, setModuleId] = useState(modules[0]?.id ?? '');
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id ?? '');
  const [mode, setMode] = useState('call');
  const [source, setSource] = useState('manual');
  const [generated, setGenerated] = useState<string[]>([]);
  const [operator, setOperator] = useState<string[]>([]);
  const [incident, setIncident] = useState('');
  const [caller, setCaller] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [addressDescription, setAddressDescription] = useState('');
  const [district, setDistrict] = useState('');
  const [okrug, setOkrug] = useState('');
  const [object, setObject] = useState('');
  const [scenePhone, setScenePhone] = useState('');
  const [description, setDescription] = useState('');
  const [victims, setVictims] = useState('');
  const [services, setServices] = useState('');
  const [expectedPrimary, setExpectedPrimary] = useState('accepted');
  const [outcome, setOutcome] = useState('completed');
  useEffect(() => {
    if (!moduleId && modules[0]) setModuleId(modules[0].id);
  }, [moduleId, modules]);
  useEffect(() => {
    if (!scenarioId && scenarios[0]) setScenarioId(scenarios[0].id);
  }, [scenarioId, scenarios]);
  const groupId = modules.find((item) => item.id === moduleId)?.group_id ?? '';
  const selectedDifficulty = modules.find((item) => item.id === moduleId)?.difficulty;
  const availableScenarios = scenarios.filter((item) => (item.difficulty ?? 'basic') === selectedDifficulty);
  const selectedScenario = availableScenarios.some((item) => item.id === scenarioId)
    ? scenarioId : availableScenarios[0]?.id ?? '';
  const selectedGenerated = generated.filter((id) => availableScenarios.some((item) => item.id === id));
  const service = groups.find((item) => item.id === groupId)?.service_code ?? '';
  const availableCards = operatorCards.filter((item) => item.services?.split(',').some((part) => {
    const normalized = part.trim().toLowerCase().replace('служба ', '');
    return normalized === service.toLowerCase().replace('служба ', '');
  }));
  const selectedCount = selectedGenerated.length + operator.length;
  const ready = Boolean(moduleId && groupId && groups.find((item) => item.id === groupId)?.member_count
    && (mode === 'call' ? selectedScenario : source === 'pool' ? selectedCount >= 2 && selectedCount <= 30
      : incident.trim() && phone.trim() && address.trim() && description.trim()));
  function toggle(current: string[], id: string, checked: boolean, update: (ids: string[]) => void) {
    update(checked ? [...current, id] : current.filter((item) => item !== id));
  }
  function submit() {
    if (mode === 'call') { onSubmit({ group_id: groupId, module_id: moduleId, scenario_id: selectedScenario, mode }); return; }
    const shared = { group_id: groupId, module_id: moduleId, mode, expected_primary: expectedPrimary, outcome };
    if (source === 'pool') {
      onSubmit({ ...shared, sources: [
        ...selectedGenerated.map((id) => ({ type: 'generated', id })),
        ...operator.map((id) => ({ type: 'operator', id })),
      ] });
    } else {
      onSubmit({ ...shared, incident_code: incident, caller_name: caller, phone, address,
        address_description: addressDescription, district, okrug, object, scene_phone: scenePhone,
        description, victims, services: [service, services].filter(Boolean).join(', ') });
    }
  }
  return <ModalForm label="Занятие" onClose={onClose}>
<FormCard title="Занятие" submitLabel="Назначить" busy={busy || !ready} error={error} onClose={onClose} onSubmit={submit}>
    <div className={formGrid}>
      <SelectField label="Учебный модуль" value={moduleId} onChange={(event) => setModuleId(event.target.value)}>
        {modules.map((item) => <option key={item.id} value={item.id}>{item.title} — {item.group_name} — {difficultyNames[item.difficulty]}</option>)}
      </SelectField>
      <SelectField label="Режим" value={mode} onChange={(event) => setMode(event.target.value)}>
        <option value="call">Звонок оператора 112</option>
        <option value="card">Карточка диспетчера ДДС</option>
      </SelectField>
      {mode === 'call' ? <SelectField label="Сценарий звонка" value={selectedScenario} onChange={(event) => setScenarioId(event.target.value)}>
        {availableScenarios.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </SelectField> : <>
        <SelectField label="Источник карточки" value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="manual">Заполнить карточку</option>
          <option value="pool">Подборка карточек</option>
        </SelectField>
        {source === 'pool' ? <div className={styles.pool}>
          <div className={styles.hint}>Выберите минимум две карточки. После обработки следующая выдаётся случайно; до исчерпания подборки карточки не повторяются.</div>
          <div className={styles.group}>
            <div className={styles.heading}>Подготовленные системой</div>
            {availableScenarios.length === 0 && <div className={styles.hint}>Нет утверждённых сценариев этой сложности.</div>}
            {availableScenarios.map((item) => <label className={formCheck} key={item.id}>
              <input type="checkbox" checked={generated.includes(item.id)}
                onChange={(event) => toggle(generated, item.id, event.target.checked, setGenerated)} />
              <span>{item.title}</span>
            </label>)}
          </div>
          <div className={styles.group}>
            <div className={styles.heading}>Заполненные операторами 112 и направленные в {service}</div>
            {availableCards.length === 0 && <div className={styles.hint}>Таких карточек пока нет.</div>}
            {availableCards.map((item) => <label className={formCheck} key={item.id}>
              <input type="checkbox" checked={operator.includes(item.id)}
                onChange={(event) => toggle(operator, item.id, event.target.checked, setOperator)} />
              <span>{item.incident_code} — {item.address}</span>
            </label>)}
          </div>
        </div> : <>
          <InputField label="Тип происшествия" value={incident} maxLength={200} onChange={(event) => setIncident(event.target.value)} />
          <InputField label="Заявитель" value={caller} maxLength={200} onChange={(event) => setCaller(event.target.value)} />
          <InputField label="Телефон заявителя" value={phone} maxLength={100} onChange={(event) => setPhone(event.target.value)} />
          <InputField label="Адрес" value={address} maxLength={1000} onChange={(event) => setAddress(event.target.value)} />
          <InputField label="Район" value={district} maxLength={200} onChange={(event) => setDistrict(event.target.value)} />
          <InputField label="Округ" value={okrug} maxLength={100} onChange={(event) => setOkrug(event.target.value)} />
          <InputField label="Объект" value={object} maxLength={200} onChange={(event) => setObject(event.target.value)} />
          <InputField label="Телефон на месте" value={scenePhone} maxLength={100} onChange={(event) => setScenePhone(event.target.value)} />
          <InputField label="Ориентир" value={addressDescription} maxLength={1000} onChange={(event) => setAddressDescription(event.target.value)} />
          <TextareaField label="Описание" value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} />
          <TextareaField label="Пострадавшие" value={victims} maxLength={1000} onChange={(event) => setVictims(event.target.value)} />
          <InputField label="Другие оповещённые службы, через запятую" value={services} maxLength={1000}
            onChange={(event) => setServices(event.target.value)} />
        </>}
        <SelectField label="Верное первичное решение ДДС" value={expectedPrimary}
          onChange={(event) => setExpectedPrimary(event.target.value)}>
          <option value="accepted">Принять</option><option value="rejected">Не принимать</option>
        </SelectField>
        <SelectField label="Исход работы бригады" value={outcome} onChange={(event) => setOutcome(event.target.value)}>
          <option value="completed">Работы завершены</option><option value="refused">Отказ от выполнения работ</option>
        </SelectField>
      </>}
    </div>
  </FormCard>
</ModalForm>;
}
