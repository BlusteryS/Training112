import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import type { User } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api';
import { downloadFile } from '../download';
import { ModalForm } from '../components/ModalForm';
import { FormCard, formGrid } from './FormCard';
import { SectionTabs } from '../components/ui/SectionTabs';
import { InputField } from '../components/ui/InputField';
import { SelectField } from '../components/ui/SelectField';
import { Desk, DeskEmpty, DeskRow, DeskSection, DeskTable, deskInlineActions, deskPlaceholder, deskError } from './Desk';
import { SummaryGrid } from './SummaryGrid';
import { Operations } from './Operations';
import { RoleField, roleNames } from './RoleField';
import { formatBytes } from '../formatBytes';

const sections = {
  users: 'Пользователи',
  status: 'Состояние',
  journal: 'Журнал',
  statistics: 'Статистика',
  policy: 'Политика доступа',
  operations: 'Параметры комплекса',
  backups: 'Резервные копии',
} as const;

const actionNames: Record<string, string> = {
  'user.created': 'Создана учётная запись',
  'user.role_changed': 'Изменена роль',
  'user.blocked': 'Доступ закрыт',
  'user.unblocked': 'Доступ открыт',
  'settings.updated': 'Изменена политика входа',
  'operations.updated': 'Изменены параметры комплекса',
  'backup.exported': 'Снята резервная копия',
  'group.created': 'Создана группа',
  'group.member_added': 'Участник добавлен',
  'group.member_removed': 'Участник исключён',
  'scenario.created': 'Создан сценарий',
  'scenario.updated': 'Изменён сценарий',
  'scenario.approved': 'Сценарий утверждён',
  'scenario.archived': 'Сценарий скрыт',
  'scenario.deleted': 'Сценарий удалён',
  'lesson.created': 'Создано занятие',
  'lesson.started': 'Занятие запущено',
  'lesson.completed': 'Занятие завершено',
  'material.created': 'Загружен материал',
  'material.deleted': 'Удалён материал',
  'evaluation.reviewed': 'Записана экспертная оценка',
  'attempt.completed': 'Попытка завершена',
  'attempt.failed': 'Попытка прервана',
};


export function AdminDesk() {
  const { section } = useParams();
  if (!section || !Object.hasOwn(pages, section)) return <Navigate replace to="/admin/users" />;
  const Page = pages[section as keyof typeof pages];
  return <div data-tab-workspace>
    <SectionTabs options={sections} basePath="/admin" />
    <Page />
  </div>;
}

function Accounts() {
  const { user } = useAuth();
  const [users, setUsers] = useState<(User & { blocked: boolean })[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<(User & { blocked: boolean }) | null>(null);
  const [error, setError] = useState('');
  const refresh = () => api<(User & { blocked: boolean })[]>('admin/users')
    .then((rows) => { setUsers(rows); setError(''); })
    .catch((cause: Error) => setError(cause.message));
  useEffect(() => { void refresh(); }, []);
  return <Desk actions={<button type="button" onClick={() => { setError(''); setCreating(true); }}>Создать</button>}>
    {users.length === 0 ? <DeskEmpty>Пользователей нет</DeskEmpty> : <DeskTable head={<><span>Логин</span><span>Роль</span><span>Доступ</span></>}>
      {users.map((entry) => <DeskRow key={entry.id}>
        <span>{entry.login}</span>
        <span>{roleNames[entry.role] ?? entry.role}</span>
        <span className={deskInlineActions}><span>{entry.blocked ? 'Закрыт' : 'Открыт'}</span>
          {entry.id !== user.id && <button type="button" onClick={() => { setError(''); setEditing(entry); }}>Изменить</button>}
        </span>
      </DeskRow>)}
    </DeskTable>}
    {error && !creating && !editing && <div className={deskError} role="alert">{error}</div>}
    {creating && <UserCreate onClose={() => setCreating(false)} onDone={() => { setCreating(false); void refresh(); }} />}
    {editing && <UserEdit entry={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); void refresh(); }} />}
  </Desk>;
}

function UserCreate({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<User['role']>('user');
  const [minLength, setMinLength] = useState(8);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<{ password_min_length: number }>('admin/settings').then((row) => setMinLength(row.password_min_length)).catch((cause: Error) => setError(cause.message));
  }, []);
  return <ModalForm label="Новый пользователь" onClose={onClose}>
<FormCard title="Новый пользователь" submitLabel="Создать" busy={busy} error={error} onClose={onClose} onSubmit={() => {
    setBusy(true); setError('');
    void api('admin/users', { login, password, role })
      .then(onDone)
      .catch((cause: Error) => { setError(cause.message); setBusy(false); });
  }}>
    <div className={formGrid}>
      <InputField label="Логин" value={login} required pattern="[a-z0-9_]{3,32}" autoComplete="off" onChange={(event) => setLogin(event.target.value)} />
      <InputField label={`Пароль, от ${minLength} символов`} value={password} type="password" autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} />
      <RoleField value={role} onChange={setRole} />
    </div>
  </FormCard>
</ModalForm>;
}

function UserEdit({ entry, onClose, onDone }: { entry: User & { blocked: boolean }; onClose: () => void; onDone: () => void }) {
  const [role, setRole] = useState(entry.role);
  const [blocked, setBlocked] = useState(entry.blocked);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <ModalForm label={entry.login} onClose={onClose}>
<FormCard title={entry.login} submitLabel="Сохранить" busy={busy} error={error} onClose={onClose} onSubmit={() => {
    setBusy(true); setError('');
    void (async () => {
      if (role !== entry.role) await api(`admin/users/${entry.id}/role`, { role });
      if (blocked !== entry.blocked) await api(`admin/users/${entry.id}/access`, { blocked });
    })().then(onDone).catch((cause: Error) => { setError(cause.message); setBusy(false); });
  }}>
    <div className={formGrid}>
      <RoleField value={role} onChange={setRole} />
      <SelectField label="Доступ" value={blocked ? 'closed' : 'open'} onChange={(event) => setBlocked(event.target.value === 'closed')}>
        <option value="open">Открыт</option>
        <option value="closed">Закрыт</option>
      </SelectField>
    </div>
  </FormCard>
</ModalForm>;
}

function Status() {
  type Failure = { id: string; kind: string; error: string | null; finished_at: string };
  type StatusData = { database: string; speech: string; worker_queue: number; failed_jobs: number;
    open_attempts: number; active_lessons: number; memory_used: number; memory_max: number;
    worker_seen: string | null; failures: Failure[] };
  const [row, setRow] = useState<StatusData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function load() {
      try {
        const next = await api<StatusData>('admin/status', undefined, controller.signal);
        if (!cancelled) { setRow(next); setError(''); }
      } catch (cause) {
        if (!cancelled) {
          setRow(null);
          setError(cause instanceof Error ? cause.message : 'Комплекс не ответил.');
        }
      } finally {
        if (!cancelled) timer = window.setTimeout(() => void load(), 5000);
      }
    }
    void load();
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timer); };
  }, []);
  const lines = row ? [
    ['База данных', row.database === 'up' ? 'Работает' : 'Нет ответа'],
    ['Речевой сервис', row.speech === 'up' ? 'Работает' : 'Нет ответа'],
    ['Очередь обработчика', String(row.worker_queue ?? 0)],
    ['Сбойные задачи', String(row.failed_jobs ?? 0)],
    ['Открытые попытки', String(row.open_attempts ?? 0)],
    ['Активные занятия', String(row.active_lessons ?? 0)],
    ['Память backend', `${Math.round(row.memory_used / 1048576)} / ${Math.round(row.memory_max / 1048576)} МиБ`],
    ...(row.worker_seen ? [['Обработчик', new Date(String(row.worker_seen)).toLocaleString('ru-RU')]] : []),
  ] : [];
  return <Desk>
    {lines.length > 0 && <SummaryGrid items={lines.map(([label, value]) => ({ label: String(label), value }))} />}
    {!!row?.failures.length && <DeskSection title="Сбои обработки"><DeskTable head={<><span>Время</span><span>Задача</span><span>Ошибка</span></>}>
      {row.failures.map((failure) => <DeskRow key={failure.id}>
        <span>{new Date(failure.finished_at).toLocaleString('ru-RU')}</span>
        <span>{failure.kind === 'compile_scenario' ? 'Подготовка сценария' : 'Оценка попытки'}</span>
        <span>{failure.error ?? 'Неизвестная ошибка'}</span>
      </DeskRow>)}
    </DeskTable></DeskSection>}
    {error && <div className={deskError} role="alert">{error}</div>}
  </Desk>;
}

function Journal() {
  const [rows, setRows] = useState<{ id: number; action: string; login: string | null; created_at: string }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<{ id: number; action: string; login: string | null; created_at: string }[]>('admin/audit')
      .then(setRows)
      .catch((cause: Error) => setError(cause.message));
  }, []);
  return <Desk>
    {rows.length === 0 ? <DeskEmpty>Записей нет</DeskEmpty> : <DeskTable head={<><span>Время</span><span>Событие</span><span>Кто</span></>}>
      {rows.map((row) => <DeskRow key={row.id}>
        <span>{new Date(row.created_at).toLocaleString('ru-RU')}</span>
        <span>{actionNames[row.action] ?? row.action}</span>
        <span className={row.login ? undefined : deskPlaceholder}>{row.login || '—'}</span>
      </DeskRow>)}
    </DeskTable>}
    {error && <div className={deskError} role="alert">{error}</div>}
  </Desk>;
}

function Statistics() {
  const [row, setRow] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { void api<Record<string, number>>('admin/statistics').then(setRow).catch((cause: Error) => setError(cause.message)); }, []);
  const lines = row ? [
    ['Администраторы', row.admins],
    ['Преподаватели', row.instructors],
    ['Обучающиеся', row.learners],
    ['Доступ закрыт', row.blocked],
    ['Сценарии', row.scenarios],
    ['Занятия', row.lessons],
    ['Идут сейчас', row.active_lessons],
    ['Попытки', row.attempts],
    ['Завершённые попытки', row.completed_attempts],
    ['Сбойные задачи', row.failed_jobs],
  ] : [];
  return <Desk>
    {lines.length > 0 && <SummaryGrid items={lines.map(([label, value]) => ({ label: String(label), value }))} />}
    {error && <div className={deskError} role="alert">{error}</div>}
  </Desk>;
}

function Policy() {
  const [passwordMin, setPasswordMin] = useState(8);
  const [sessionHours, setSessionHours] = useState(168);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<{ password_min_length: number; session_hours: number }>('admin/settings').then((row) => {
      setPasswordMin(row.password_min_length);
      setSessionHours(row.session_hours);
    }).catch((cause: Error) => setError(cause.message));
  }, []);
  return <Desk actions={<button type="button" onClick={() => { setError(''); setOpen(true); }}>Изменить</button>}>
    <SummaryGrid items={[
      { label: 'Минимальная длина пароля', value: `${passwordMin} символов` },
      { label: 'Время действия сессии', value: `${sessionHours} часов` },
    ]} />
    {error && !open && <div className={deskError} role="alert">{error}</div>}
    {open && <ModalForm label="Политика доступа" onClose={() => setOpen(false)}>
<FormCard title="Политика доступа" submitLabel="Сохранить" busy={busy} error={error} onClose={() => setOpen(false)} onSubmit={() => {
      setBusy(true); setError('');
      void api('admin/settings', { password_min_length: passwordMin, session_hours: sessionHours })
        .then(() => { setBusy(false); setOpen(false); })
        .catch((cause: Error) => { setError(cause.message); setBusy(false); });
    }}>
      <div className={formGrid}>
        <InputField label="Пароль, символов" value={String(passwordMin)} inputMode="numeric" onChange={(event) => setPasswordMin(Number(event.target.value.replace(/\D/g, '').slice(0, 2) || 0))} />
        <InputField label="Сессия, часов" value={String(sessionHours)} inputMode="numeric" onChange={(event) => setSessionHours(Number(event.target.value.replace(/\D/g, '').slice(0, 3) || 0))} />
      </div>
    </FormCard>
</ModalForm>}
  </Desk>;
}

function Backups() {
  const [rows, setRows] = useState<{ id: string; created_at: string; byte_size: number; login: string | null; source: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => api<typeof rows>('admin/backups').then(setRows);
  useEffect(() => { void refresh().catch((cause: Error) => setError(cause.message)); }, []);
  return <Desk actions={<button type="button" disabled={busy} onClick={() => {
    setBusy(true); setError('');
    void api<Record<string, unknown>>('admin/backups', {})
      .then((payload) => {
        downloadFile(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
          `training112-${String(payload.backup_id)}.json`);
        return refresh();
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setBusy(false));
  }}>Снять копию</button>}>
    {rows.length === 0 ? <DeskEmpty>Копий нет</DeskEmpty> : <DeskTable head={<><span>Время</span><span>Кто</span><span>Размер</span></>}>
      {rows.map((row) => <DeskRow key={row.id}>
        <span>{new Date(row.created_at).toLocaleString('ru-RU')}</span>
        <span>{row.source === 'automatic' ? 'Автоматически' : row.login}</span>
        <span>{formatBytes(row.byte_size)}</span>
      </DeskRow>)}
    </DeskTable>}
    {error && <div className={deskError} role="alert">{error}</div>}
  </Desk>;
}

const pages = { users: Accounts, status: Status, journal: Journal,
  statistics: Statistics, policy: Policy, operations: Operations, backups: Backups };
