import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Button, SnackbarProvider } from '@training112/components';
import { ApiError, authApi, type User } from './auth/api';
import { AuthContext } from './auth/AuthContext';
import { AppLayout } from './layout/AppLayout';
import { PageLayout } from './layout/PageLayout';
import { SectionPage } from './layout/SectionPage';
import { ProfilePage } from './pages/ProfilePage';
import { SpeechPage } from './pages/SpeechPage';
import { ModalRoute } from './modals/ModalRoute';
import { ComponentCatalogPage } from './pages/ComponentCatalogPage';
import { LoginPage } from './pages/LoginPage';

type Session =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User }
  | { status: 'error'; message: string };

function CatalogLayout() {
  return <><ComponentCatalogPage /><Outlet /></>;
}

export function App() {
  const [session, setSession] = useState<Session>({ status: 'loading' });
  const [retry, setRetry] = useState(0);
  const sessionRevision = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      const revision = ++sessionRevision.current;
      authApi.me(controller.signal).then(({ user }) => {
        if (revision === sessionRevision.current) setSession({ status: 'authenticated', user });
      }).catch((error: unknown) => {
        if (controller.signal.aborted || revision !== sessionRevision.current) return;
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
    sessionRevision.current += 1;
    setSession({ status: 'authenticated', user });
  }, []);
  const logout = useCallback(async () => {
    await authApi.logout();
    sessionRevision.current += 1;
    setSession({ status: 'anonymous' });
  }, []);

  return (
    <SnackbarProvider>
      {session.status === 'loading' ? null
        : session.status === 'error' ? (
          <main className="session-status">
            <p role="alert">{session.message}</p>
            <Button onClick={() => { setSession({ status: 'loading' }); setRetry((value) => value + 1); }}>Повторить</Button>
          </main>
        ) : session.status === 'anonymous' ? <LoginPage onLogin={handleLogin} /> : (
          <AuthContext.Provider value={{ user: session.user, logout }}>
            <Routes>
              <Route element={<AppLayout />} path="/">
                <Route element={<PageLayout />}>
                  <Route element={<ProfilePage />} index />
                  <Route element={<SpeechPage />} path="session" />
                  <Route element={<SectionPage title="Документация" />} path="docs" />
                </Route>
                <Route element={<CatalogLayout />} path="ui">
                  <Route element={<ModalRoute />} path="modal/form" />
                </Route>
                <Route element={<Navigate replace to="/ui/modal/form#modal" />} path="modal/form" />
              </Route>
              <Route element={<Navigate replace to="/" />} path="*" />
            </Routes>
          </AuthContext.Provider>
        )}
    </SnackbarProvider>
  );
}
