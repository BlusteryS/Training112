import { useState, type FormEvent } from 'react';
import { ApiError, authApi, type User } from '../auth/api';
import city from '../assets/login-city.svg';
import './LoginPage.css';

export function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !login.trim() || !password) return;
    setBusy(true);
    setError('');
    try {
      const { user } = await authApi.login({ login: login.trim(), password });
      setPassword('');
      onLogin(user);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError && cause.status === 401
        ? 'Неверный логин или пароль.'
        : cause instanceof Error ? cause.message : 'Не удалось войти.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="login-page">
    <img className="login-page__city" src={city} alt="" />
    <form className="login-card" onSubmit={submit} aria-busy={busy}>
      <header className="login-card__header">
        <h1 className="login-card__number">112</h1>
        <div className="login-card__title">
          <span className="login-card__badge">Учебная</span>
          <span>Вход в систему</span>
        </div>
      </header>

      <div className="login-card__fields">
        <label className="login-card__field">
          <span className="login-card__label">Логин</span>
          <input name="login" autoComplete="username" autoCapitalize="none"
            spellCheck={false} required minLength={3} maxLength={32} disabled={busy}
            placeholder="Введите логин" value={login}
            onChange={(event) => setLogin(event.target.value)} />
        </label>
        <label className="login-card__field">
          <span className="login-card__label">Пароль</span>
          <input name="password" type="password" autoComplete="current-password"
            required maxLength={128} disabled={busy} placeholder="Введите пароль"
            value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
      </div>

      {error && <p className="login-card__error" role="alert">{error}</p>}

      <button className="login-card__submit" type="submit"
        disabled={busy || !login.trim() || !password}>
        {busy ? 'Входим…' : 'Вход в систему'}
      </button>

      <section className="login-card__support" aria-label="Техническая поддержка">
        <p>Техподдержка</p>
        <a href="tel:+79451978981">+7 (945) 197 89-81 (Многоканальный)</a>
        <a className="login-card__email" href="mailto:hd-112@mos.ru">hd-112@mos.ru</a>
      </section>
    </form>
  </main>;
}
