import { useEffect, useState, type FormEvent } from 'react';
import type { User } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api';
import { ActionButton, ActionRow } from '../components/ui/ActionButton';
import { SectionTabs } from '../components/ui/SectionTabs';
import { Field } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { ManagementPanel, PanelList, PanelListItem, PanelTitle } from './Panel';

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

export function AdminDesk() {
  const [section, setSection] = useState<Section>('users');
  return <ManagementPanel>
    <SectionTabs value={section} options={sections} onChange={setSection} />
    <div>Администратор ведёт учётные записи, политику входа и состояние комплекса. Оценки и сценарии во время занятия меняет преподаватель.</div>
    {section === 'users' && <Accounts />}
    {section === 'status' && <Status />}
    {section === 'journal' && <Journal />}
    {section === 'statistics' && <Statistics />}
    {section === 'policy' && <Policy />}
    {section === 'backups' && <Backups />}
  </ManagementPanel>;
}

function Accounts() {
  const { user } = useAuth();
  const [users, setUsers] = useState<(User & { blocked: boolean })[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => api<(User & { blocked: boolean })[]>('admin/users').then(setUsers);
  useEffect(() => { void refresh().catch((cause: Error) => setError(cause.message)); }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setBusy(true); setError('');
    try {
      await api('admin/users', Object.fromEntries(new FormData(form)));
      form.reset();
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ошибка создания пользователя.'); }
    finally { setBusy(false); }
  }
  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await work(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось изменить пользователя.'); }
    finally { setBusy(false); }
  }
  return <div>
    <PanelTitle>Пользователи системы</PanelTitle>
    <form onSubmit={(event) => void create(event)}>
      <Field label="Логин"><input name="login" required pattern="[a-z0-9_]{3,32}" autoComplete="off" /></Field>
      <Field label="Пароль"><input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></Field>
      <Field label="Роль"><select name="role"><option value="user">Обучающийся</option><option value="teacher">Преподаватель</option><option value="admin">Администратор</option></select></Field>
      <ActionButton type="submit" disabled={busy}>Создать пользователя</ActionButton>
    </form>
    {error && <Notice error>{error}</Notice>}
    <PanelList>{users.map((entry) => <PanelListItem key={entry.id}>
      {entry.login} — {roleNames[entry.role]} — {entry.blocked ? 'доступ заблокирован' : 'доступ разрешён'}{' '}
      {entry.id !== user.id && <>
        <label>Роль{' '}
          <select value={entry.role} disabled={busy} onChange={(event) => {
            const role = event.target.value;
            void act(async () => { await api(`admin/users/${entry.id}/role`, { role }); });
          }}>
            <option value="user">Обучающийся</option>
            <option value="teacher">Преподаватель</option>
            <option value="admin">Администратор</option>
          </select>
        </label>{' '}
        <button disabled={busy} onClick={() => void act(async () => {
          await api(`admin/users/${entry.id}/access`, { blocked: !entry.blocked });
        })}>{entry.blocked ? 'Разблокировать' : 'Заблокировать'}</button>
      </>}
    </PanelListItem>)}</PanelList>
  </div>;
}

function Status() {
  const [row, setRow] = useState<Record<string, string | number | null> | null>(null);
  const [error, setError] = useState('');
  async function load() {
    try { setRow(await api('admin/status')); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Комплекс не ответил.'); }
  }
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, []);
  return <div>
    <PanelTitle>Состояние комплекса</PanelTitle>
    <div>База, речевой сервис и очередь обработчика. Запуск и остановка контейнеров выполняются на сервере: у процесса приложения нет доступа к Docker.</div>
    {row && <div>
      <div>База данных: {row.database}</div>
      <div>Речевой сервис {String(row.speech_endpoint)}: {row.speech}</div>
      <div>Очередь обработчика: {row.worker_queue}, последняя задача: {row.worker_seen ?? 'ещё не было'}</div>
      <div>Сбойные задачи: {row.failed_jobs}</div>
      <div>Открытые попытки: {row.open_attempts}, активные занятия: {row.active_lessons}</div>
      <div>Память процесса: {Math.round(Number(row.memory_used) / 1048576)} из {Math.round(Number(row.memory_max) / 1048576)} МиБ</div>
      <div>Учётных записей: {row.users}</div>
    </div>}
    {error && <Notice error>{error}</Notice>}
  </div>;
}

function Journal() {
  const [rows, setRows] = useState<{ id: number; action: string; login: string | null; created_at: string; detail: Record<string, unknown> }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { void api<typeof rows>('admin/audit').then(setRows).catch((cause: Error) => setError(cause.message)); }, []);
  return <div>
    <PanelTitle>Журнал действий</PanelTitle>
    <div>Записи только добавляются и хранятся в базе. Удаление журнала из интерфейса недоступно.</div>
    {rows.map((row) => <div key={row.id}>{new Date(row.created_at).toLocaleString('ru-RU')} — {row.login ?? 'система'} — {row.action}</div>)}
    {error && <Notice error>{error}</Notice>}
  </div>;
}

function Statistics() {
  const [row, setRow] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { void api<Record<string, number>>('admin/statistics').then(setRow).catch((cause: Error) => setError(cause.message)); }, []);
  return <div>
    <PanelTitle>Статистика использования</PanelTitle>
    {row && <div>
      <div>Администраторы: {row.admins}, преподаватели: {row.teachers}, обучающиеся: {row.learners}, заблокированы: {row.blocked}</div>
      <div>Сценарии: {row.scenarios}, занятия: {row.lessons}, из них идут сейчас: {row.active_lessons}</div>
      <div>Попытки: {row.attempts}, завершённые: {row.completed_attempts}, сбойные задачи: {row.failed_jobs}</div>
    </div>}
    {error && <Notice error>{error}</Notice>}
  </div>;
}

function Policy() {
  const [passwordMin, setPasswordMin] = useState('8');
  const [sessionHours, setSessionHours] = useState('168');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    void api<{ password_min_length: number; session_hours: number }>('admin/settings').then((row) => {
      setPasswordMin(String(row.password_min_length));
      setSessionHours(String(row.session_hours));
    }).catch((cause: Error) => setError(cause.message));
  }, []);
  return <div>
    <PanelTitle>Политика доступа</PanelTitle>
    <div>Минимальная длина пароля применяется при создании учётной записи. Длительность сессии применяется при следующем входе.</div>
    <Field label="Минимальная длина пароля, 8–64"><input value={passwordMin} inputMode="numeric" onChange={(event) => setPasswordMin(event.target.value.replace(/\D/g, '').slice(0, 2))} /></Field>
    <Field label="Сессия, часы, 1–720"><input value={sessionHours} inputMode="numeric" onChange={(event) => setSessionHours(event.target.value.replace(/\D/g, '').slice(0, 3))} /></Field>
    <ActionRow><ActionButton onClick={() => {
      setError(''); setMessage('');
      void api('admin/settings', { password_min_length: Number(passwordMin), session_hours: Number(sessionHours) })
        .then(() => setMessage('Политика сохранена.'))
        .catch((cause: Error) => setError(cause.message));
    }}>Сохранить политику</ActionButton></ActionRow>
    {error && <Notice error>{error}</Notice>}
    {message && <Notice>{message}</Notice>}
  </div>;
}

function Backups() {
  const [rows, setRows] = useState<{ id: string; created_at: string; sha256: string; byte_size: number; login: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => api<typeof rows>('admin/backups').then(setRows);
  useEffect(() => { void refresh().catch((cause: Error) => setError(cause.message)); }, []);
  return <div>
    <PanelTitle>Резервные копии</PanelTitle>
    <div>Копия содержит учебные данные без паролей и без подготовленных голосовых файлов. Голос хранится в томе речевого сервиса.</div>
    <ActionButton disabled={busy} onClick={() => {
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
    }}>Снять и скачать копию</ActionButton>
    <PanelList>{rows.map((row) => <PanelListItem key={row.id}>
      {new Date(row.created_at).toLocaleString('ru-RU')} — {row.login} — {row.byte_size} байт — {row.sha256.slice(0, 12)}
    </PanelListItem>)}</PanelList>
    {error && <Notice error>{error}</Notice>}
  </div>;
}
