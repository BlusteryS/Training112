import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ApiError, authApi, type User } from './auth/api';
import { AuthContext, useAuth } from './auth/AuthContext';
import { SpeechPage } from './pages/SpeechPage';
import { LoginPage } from './pages/LoginPage';
import { Management } from './management/Management';
import { Assignments } from './pages/Assignments';

type Session =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User }
  | { status: 'error'; message: string };

function Home() {
  const { user, logout } = useAuth();
  const [error, setError] = useState('');
  return <main>
    <h1>Тренажёр оператора ДДС</h1>
    <p>Пользователь: {user.login}</p>
    {user.role === 'user' && <Assignments />}
    <Management />
    <button onClick={() => { void logout().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Не удалось выйти.');
    }); }}>Выйти</button>
    {error && <p role="alert">{error}</p>}
  </main>;
}

export function App() {
  const [session, setSession] = useState<Session>({ status: 'loading' });
  const [retry, setRetry] = useState(0);
  const authRequest = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      const request = ++authRequest.current;
      authApi.me(controller.signal).then(({ user }) => {
        if (request === authRequest.current) setSession({ status: 'authenticated', user });
      }).catch((error: unknown) => {
        if (controller.signal.aborted || request !== authRequest.current) return;
        if (error instanceof ApiError && error.status === 401) {
          setSession({ status: 'anonymous' });
        } else {
          setSession({ status: 'error', message: error instanceof Error ? error.message : 'Не удалось проверить сессию.' });
        }
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      controller.abort();
      window.removeEventListener('focus', refresh);
    };
  }, [retry]);

  const handleLogin = useCallback((user: User) => {
    authRequest.current += 1;
    setSession({ status: 'authenticated', user });
  }, []);
  const logout = useCallback(async () => {
    await authApi.logout();
    authRequest.current += 1;
    setSession({ status: 'anonymous' });
  }, []);

  return (
    <>
      {session.status === 'loading' ? <p role="status">Проверяем вход…</p>
        : session.status === 'error' ? (
          <main>
            <p role="alert">{session.message}</p>
            <button onClick={() => { setSession({ status: 'loading' }); setRetry((value) => value + 1); }}>Повторить</button>
          </main>
        ) : session.status === 'anonymous' ? <LoginPage onLogin={handleLogin} /> : (
          <AuthContext.Provider value={{ user: session.user, logout }}>
            <Routes>
              <Route element={session.user.role === 'user' ? <SpeechPage /> : <Navigate replace to="/" />} path="/session" />
              <Route element={<Home />} path="/" />
              <Route element={<Navigate replace to="/" />} path="*" />
            </Routes>
          </AuthContext.Provider>
        )}
    </>
  );
}
