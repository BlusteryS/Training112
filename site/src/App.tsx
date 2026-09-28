import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ApiError, authApi, type User } from './auth/api';
import { AuthContext, useAuth } from './auth/AuthContext';
import { NotificationProvider } from './components/Notifications';
import { WorkspaceHeader } from './components/shell/WorkspaceHeader';
import { LoginPage } from './pages/LoginPage';
import styles from './App.module.css';

const AdminDesk = lazy(() => import('./management/AdminDesk').then((module) => ({ default: module.AdminDesk })));
const InstructorWorkspace = lazy(() => import('./management/InstructorWorkspace').then((module) => ({ default: module.InstructorWorkspace })));
const OperatorWorkspace = lazy(() => import('./pages/OperatorWorkspace').then((module) => ({ default: module.OperatorWorkspace })));
const CardDesk = lazy(() => import('./pages/CardDesk').then((module) => ({ default: module.CardDesk })));
const LearnerProgress = lazy(() => import('./pages/LearnerProgress').then((module) => ({ default: module.LearnerProgress })));
const SpeechPage = lazy(() => import('./pages/SpeechPage').then((module) => ({ default: module.SpeechPage })));

type Session =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User }
  | { status: 'error'; message: string };

function StaffWorkspace({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <div className={styles.workspace}>
    <WorkspaceHeader leading={<div className={styles.searchPanel}>
      <div className={styles.staffTitle}>{user.role === 'admin' ? 'Администрирование' : 'Кабинет преподавателя'}</div>
      <div className={styles.searchRule} />
      <div className={styles.searchFooter}>Учебный комплекс</div>
    </div>} />
    <div className={styles.operatorContent}>
      {children}
    </div>
  </div>;
}

function Home() {
  const { user } = useAuth();
  return user.role === 'user' ? <OperatorWorkspace />
    : <Navigate replace to={user.role === 'admin' ? '/admin/users' : '/instructor/lessons'} />;
}

function Application() {
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
        if (error instanceof ApiError && error.status === 401) setSession({ status: 'anonymous' });
        else setSession({ status: 'error', message: error instanceof Error ? error.message : 'Не удалось проверить сессию.' });
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

  return session.status === 'loading' ? null
    : session.status === 'error' ? <div>
      <div role="alert">{session.message}</div>
      <button onClick={() => { setSession({ status: 'loading' }); setRetry((value) => value + 1); }}>Повторить</button>
    </div>
      : session.status === 'anonymous' ? <LoginPage onLogin={handleLogin} />
        : <AuthContext.Provider value={{ user: session.user, logout }}>
          <Suspense fallback={null}><Routes>
            <Route element={session.user.role === 'user' ? <SpeechPage /> : <Navigate replace to="/" />} path="/session" />
            <Route element={session.user.role === 'user' ? <CardDesk /> : <Navigate replace to="/" />} path="/card" />
            <Route element={session.user.role === 'user' ? <LearnerProgress /> : <Navigate replace to="/" />} path="/progress" />
            <Route element={session.user.role === 'instructor' ? <StaffWorkspace><InstructorWorkspace /></StaffWorkspace> : <Navigate replace to="/" />} path="/instructor/:section" />
            <Route element={session.user.role === 'admin' ? <StaffWorkspace><AdminDesk /></StaffWorkspace> : <Navigate replace to="/" />} path="/admin/:section" />
            <Route element={<Home />} path="/" />
            <Route element={<Navigate replace to="/" />} path="*" />
          </Routes></Suspense>
        </AuthContext.Provider>;
}

export function App() {
  return <NotificationProvider><Application /></NotificationProvider>;
}
