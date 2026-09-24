import { useEffect, useState } from 'react';
import type { User } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api';
import { ModalForm } from '../components/ModalForm';
import { FormCard, formGrid } from './FormCard';
import { SectionTabs } from '../components/ui/SectionTabs';
import { Field } from '../components/ui/Field';
import { Desk, DeskEmpty, DeskRow, DeskTable, deskActions, deskError } from './Desk';

const sections = {
  users: 'Пользователи',
  status: 'Состояние',
  journal: 'Журнал',
  statistics: 'Статистика',
  policy: 'Политика доступа',
  backups: 'Резервные копии',
} as const;

type Section = keyof typeof sections;
const roleNames: Record<string, string> = { user: 'Обучающийся', teacher: 'Преподаватель', admin: 'Администратор' };
const actionNames: Record<string, string> = {
  'user.created': 'Создана учётная запись',
  'user.role_changed': 'Изменена роль',
  'user.blocked': 'Доступ закрыт',
  'user.unblocked': 'Доступ открыт',
  'settings.updated': 'Изменена политика входа',
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

const userColumns = 'minmax(160px, 1fr) 180px 140px 120px';

export function AdminDesk() {
  const [section, setSection] = useState<Section>('users');
  return <div>
    <SectionTabs value={section} options={sections} onChange={setSection} />
    {section === 'users' && <Accounts />}
    {section === 'status' && <Status />}
    {section === 'journal' && <Journal />}
    {section === 'statistics' && <Statistics />}
    {section === 'policy' && <Policy />}
    {section === 'backups' && <Backups />}
  </div>;
}

function Accounts() {
  const { user } = useAuth();
  const [users, setUsers] = useState<(User & { blocked: boolean })[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<(User & { blocked: boolean }) | null>(null);
  const [error, setError] = useState('');
  const refresh = () => api<(User & { blocked: boolean })[]>('admin/users').then(setUsers);
  useEffect(() => { void refresh().catch((cause: Error) => setError(cause.message)); }, []);
  return <Desk title="Пользователи" actions={<button type="button" onClick={() => { setError(''); setCreating(true); }}>Создать</button>}>
    {users.length === 0 ? <DeskEmpty>Пользователей нет</DeskEmpty> : <DeskTable columns={userColumns} head={<><span>Логин</span><span>Роль</span><span>Доступ</span><span /></>}>
      {users.map((entry) => <DeskRow key={entry.id} columns={userColumns}>
        <span>{entry.login}</span>
        <span>{roleNames[entry.role] ?? entry.role}</span>
        <span>{entry.blocked ? 'Закрыт' : 'Открыт'}</span>
        <span className={deskActions}>{entry.id !== user.id && <button type="button" onClick={() => { setError(''); setEditing(entry); }}>Изменить</button>}</span>
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
  const [role, setRole] = useState('user');
  const [minLength, setMinLength] = useState(8);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<{ password_min_length: number }>('admin/settings').then((row) => setMinLength(row.password_min_length)).catch((cause: Error) => setError(cause.message));
  }, []);
  return <ModalForm label="Новый пользователь">
<FormCard title="Новый пользователь" submitLabel="Создать" busy={busy} error={error} onClose={onClose} onSubmit={() => {
    setBusy(true); setError('');
    void api('admin/users', { login, password, role })
      .then(onDone)
      .catch((cause: Error) => { setError(cause.message); setBusy(false); });
  }}>
    <div className={formGrid}>
      <Field label="Логин"><input value={login} required pattern="[a-z0-9_]{3,32}" autoComplete="off" onChange={(event) => setLogin(event.target.value)} /></Field>
      <Field label={`Пароль, от ${minLength} символов`}><input value={password} type="password" autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} /></Field>
      <Field label="Роль"><select value={role} onChange={(event) => {
        const value = event.target.value;
        if (value === 'user' || value === 'teacher' || value === 'admin') setRole(value);
      }}>
        <option value="user">Обучающийся</option>
        <option value="teacher">Преподаватель</option>
        <option value="admin">Администратор</option>
      </select></Field>
    </div>
  </FormCard>
</ModalForm>;
}

function UserEdit({ entry, onClose, onDone }: { entry: User & { blocked: boolean }; onClose: () => void; onDone: () => void }) {
  const [role, setRole] = useState(entry.role);
  const [blocked, setBlocked] = useState(entry.blocked);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <ModalForm label={entry.login}>
<FormCard title={entry.login} submitLabel="Сохранить" busy={busy} error={error} onClose={onClose} onSubmit={() => {
    setBusy(true); setError('');
    void (async () => {
      if (role !== entry.role) await api(`admin/users/${entry.id}/role`, { role });
      if (blocked !== entry.blocked) await api(`admin/users/${entry.id}/access`, { blocked });
    })().then(onDone).catch((cause: Error) => { setError(cause.message); setBusy(false); });
  }}>
    <div className={formGrid}>
      <Field label="Роль"><select value={role} onChange={(event) => {
        const value = event.target.value;
        if (value === 'user' || value === 'teacher' || value === 'admin') setRole(value);
      }}>
        <option value="user">Обучающийся</option>
        <option value="teacher">Преподаватель</option>
        <option value="admin">Администратор</option>
      </select></Field>
      <Field label="Доступ"><select value={blocked ? 'closed' : 'open'} onChange={(event) => setBlocked(event.target.value === 'closed')}>
        <option value="open">Открыт</option>
        <option value="closed">Закрыт</option>
      </select></Field>
    </div>
  </FormCard>
</ModalForm>;
}

function Status() {
  const [row, setRow] = useState<Record<string, string | number | null> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const next = await api<Record<string, string | number | null>>('admin/status');
        if (!cancelled) { setRow(next); setError(''); }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Комплекс не ответил.');
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);
  const lines = row ? [
    ['База данных', row.database === 'up' ? 'Работает' : 'Нет ответа'],
    ['Речевой сервис', row.speech === 'up' ? 'Работает' : 'Нет ответа'],
    ['Очередь обработчика', String(row.worker_queue ?? 0)],
    ['Сбойные задачи', String(row.failed_jobs ?? 0)],
    ['Открытые попытки', String(row.open_attempts ?? 0)],
    ['Активные занятия', String(row.active_lessons ?? 0)],
    ['Память', `${Math.round(Number(row.memory_used) / 1048576)} / ${Math.round(Number(row.memory_max) / 1048576)} МиБ`],
    ...(row.worker_seen ? [['Обработчик', new Date(String(row.worker_seen)).toLocaleString('ru-RU')]] : []),
  ] : [];
  return <Desk title="Состояние">
    {lines.length > 0 && <DeskTable columns="220px minmax(0, 1fr)" head={<><span>Показатель</span><span>Значение</span></>}>
      {lines.map(([name, value]) => <DeskRow key={name} columns="220px minmax(0, 1fr)"><span>{name}</span><span>{value}</span></DeskRow>)}
    </DeskTable>}
    {error && <div className={deskError} role="alert">{error}</div>}
  </Desk>;
}

function Journal() {
  const [rows, setRows] = useState<{ id: number; action: string; login: string | null; created_at: string }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<{ id: number; action: string; login: string | null; created_at: string }[]>('admin/audit')
      .then((items) => setRows(items.filter((item) => actionNames[item.action])))
      .catch((cause: Error) => setError(cause.message));
  }, []);
  const columns = '220px minmax(0, 1fr) 180px';
  return <Desk title="Журнал">
    {rows.length === 0 ? <DeskEmpty>Записей нет</DeskEmpty> : <DeskTable columns={columns} head={<><span>Время</span><span>Событие</span><span>Кто</span></>}>
      {rows.map((row) => <DeskRow key={row.id} columns={columns}>
        <span>{new Date(row.created_at).toLocaleString('ru-RU')}</span>
        <span>{actionNames[row.action]}</span>
        <span>{row.login ?? ''}</span>
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
    ['Преподаватели', row.teachers],
    ['Обучающиеся', row.learners],
    ['Доступ закрыт', row.blocked],
    ['Сценарии', row.scenarios],
    ['Занятия', row.lessons],
    ['Идут сейчас', row.active_lessons],
    ['Попытки', row.attempts],
    ['Завершённые попытки', row.completed_attempts],
    ['Сбойные задачи', row.failed_jobs],
  ] : [];
  return <Desk title="Статистика">
    {lines.length > 0 && <DeskTable columns="220px 120px" head={<><span>Показатель</span><span>Количество</span></>}>
      {lines.map(([name, value]) => <DeskRow key={String(name)} columns="220px 120px"><span>{name}</span><span>{value}</span></DeskRow>)}
    </DeskTable>}
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
  const columns = '220px 120px';
  return <Desk title="Политика доступа" actions={<button type="button" onClick={() => { setError(''); setOpen(true); }}>Изменить</button>}>
    <DeskTable columns={columns} head={<><span>Параметр</span><span>Значение</span></>}>
      <DeskRow columns={columns}><span>Пароль, символов</span><span>{passwordMin}</span></DeskRow>
      <DeskRow columns={columns}><span>Сессия, часов</span><span>{sessionHours}</span></DeskRow>
    </DeskTable>
    {error && !open && <div className={deskError} role="alert">{error}</div>}
    {open && <ModalForm label="Политика доступа">
<FormCard title="Политика доступа" submitLabel="Сохранить" busy={busy} error={error} onClose={() => setOpen(false)} onSubmit={() => {
      setBusy(true); setError('');
      void api('admin/settings', { password_min_length: passwordMin, session_hours: sessionHours })
        .then(() => { setBusy(false); setOpen(false); })
        .catch((cause: Error) => { setError(cause.message); setBusy(false); });
    }}>
      <div className={formGrid}>
        <Field label="Пароль, символов"><input value={String(passwordMin)} inputMode="numeric" onChange={(event) => setPasswordMin(Number(event.target.value.replace(/\D/g, '').slice(0, 2) || 0))} /></Field>
        <Field label="Сессия, часов"><input value={String(sessionHours)} inputMode="numeric" onChange={(event) => setSessionHours(Number(event.target.value.replace(/\D/g, '').slice(0, 3) || 0))} /></Field>
      </div>
    </FormCard>
</ModalForm>}
  </Desk>;
}

function Backups() {
  const [rows, setRows] = useState<{ id: string; created_at: string; byte_size: number; login: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => api<typeof rows>('admin/backups').then(setRows);
  useEffect(() => { void refresh().catch((cause: Error) => setError(cause.message)); }, []);
  const columns = '220px 180px 140px';
  return <Desk title="Резервные копии" actions={<button type="button" disabled={busy} onClick={() => {
    setBusy(true); setError('');
    void api<Record<string, unknown>>('admin/backups', {})
      .then((payload) => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `training112-${String(payload.backup_id)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return refresh();
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setBusy(false));
  }}>Снять копию</button>}>
    {rows.length === 0 ? <DeskEmpty>Копий нет</DeskEmpty> : <DeskTable columns={columns} head={<><span>Время</span><span>Кто</span><span>Размер</span></>}>
      {rows.map((row) => <DeskRow key={row.id} columns={columns}>
        <span>{new Date(row.created_at).toLocaleString('ru-RU')}</span>
        <span>{row.login}</span>
        <span>{row.byte_size}</span>
      </DeskRow>)}
    </DeskTable>}
    {error && <div className={deskError} role="alert">{error}</div>}
  </Desk>;
}
