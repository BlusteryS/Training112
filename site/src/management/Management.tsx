import { useEffect, useState, type FormEvent } from 'react';
import type { User } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api';
import { TeacherWorkspace } from './TeacherWorkspace';

const roleNames: Record<string, string> = {
  user: 'Обучающийся',
  teacher: 'Преподаватель',
  admin: 'Администратор',
};

export function Management() {
  const { user } = useAuth();
  return user.role === 'admin' ? <Accounts /> : user.role === 'teacher' ? <TeacherWorkspace /> : null;
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
    const fields = new FormData(form);
    setBusy(true); setError('');
    try {
      await api('admin/users', Object.fromEntries(fields));
      form.reset(); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ошибка создания пользователя.'); }
    finally { setBusy(false); }
  }
  return <section><h2>Пользователи системы</h2>
    <form onSubmit={create}>
      <p><label>Логин <input name="login" required pattern="[a-z0-9_]{3,32}" autoComplete="off" /></label></p>
      <p><label>Пароль <input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label></p>
      <p><label>Роль <select name="role"><option value="user">Обучающийся</option><option value="teacher">Преподаватель</option><option value="admin">Администратор</option></select></label></p>
      <button disabled={busy}>Создать пользователя</button>
    </form>
    {error && <p role="alert">{error}</p>}
    <ul>{users.map((entry) => <li key={entry.id}>
      {entry.login} — {roleNames[entry.role]} — {entry.blocked ? 'доступ заблокирован' : 'доступ разрешён'}{' '}
      {entry.id !== user.id && <>
        <label>Роль{' '}
          <select value={entry.role} disabled={busy} onChange={(event) => {
            const role = event.target.value;
            void actAccount(async () => { await api(`admin/users/${entry.id}/role`, { role }); });
          }}>
            <option value="user">Обучающийся</option>
            <option value="teacher">Преподаватель</option>
            <option value="admin">Администратор</option>
          </select>
        </label>{' '}
        <button disabled={busy} onClick={() => void actAccount(async () => {
          await api(`admin/users/${entry.id}/access`, { blocked: !entry.blocked });
        })}>{entry.blocked ? 'Разблокировать' : 'Заблокировать'}</button>
      </>}
    </li>)}</ul>
  </section>;

  async function actAccount(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await work(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось изменить пользователя.'); }
    finally { setBusy(false); }
  }
}
