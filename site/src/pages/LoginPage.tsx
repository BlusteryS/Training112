import { useState, type FormEvent } from 'react';
import { ApiError, authApi, type User } from '../auth/api';
import { useNotification } from '../components/Notifications';
import city from '../assets/login-city.svg';
import styles from './LoginPage.module.css';

export function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const notify = useNotification();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [workstation, setWorkstation] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !login.trim() || !password || !workstation) return;
    setBusy(true);
    try {
      const { user } = await authApi.login({ login: login.trim(), password, workstation });
      setPassword('');
      onLogin(user);
    } catch (cause: unknown) {
      notify(cause instanceof ApiError && cause.status === 401
        ? 'Неверный логин или пароль.'
        : cause instanceof Error ? cause.message : 'Не удалось войти.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return <div className={styles.page}>
    <img className={styles.city} src={city} alt="" />
    <form className={styles.card} onSubmit={submit} aria-busy={busy}>
      <div className={styles.header}>
        <div className={styles.number}>112</div>
        <div className={styles.title}>
          <span className={styles.badge}>Учебная</span>
          <span>Вход в систему</span>
        </div>
      </div>

      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.label}>Логин</span>
          <input name="login" autoComplete="username" autoCapitalize="none"
            spellCheck={false} required minLength={3} maxLength={32} disabled={busy}
            placeholder="Введите логин" value={login}
            onChange={(event) => setLogin(event.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Пароль</span>
          <input name="password" type="password" autoComplete="current-password"
            required maxLength={128} disabled={busy} placeholder="Введите пароль"
            value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Номер АРМ</span>
          <input name="workstation" inputMode="numeric" autoComplete="off" pattern="[0-9]{1,4}"
            required maxLength={4} disabled={busy} placeholder="Номер АРМ"
            value={workstation} onChange={(event) => setWorkstation(event.target.value.replace(/\D/g, '').slice(0, 4))} />
        </label>
      </div>

      <button className={styles.submit} type="submit"
        disabled={busy || !login.trim() || !password || !workstation}>
        Вход в систему
      </button>

      <div className={styles.support}>
        <div className={styles.supportTitle}>Техподдержка</div>
        <a href="tel:+79451978981">+7 (945) 197 89-81 (Многоканальный)</a>
        <a className={styles.email} href="mailto:hd-112@mos.ru">hd-112@mos.ru</a>
      </div>
    </form>
  </div>;
}
