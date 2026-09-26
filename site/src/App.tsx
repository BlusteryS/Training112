import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api';
import { ApiError, authApi, type User } from './auth/api';
import { AuthContext, useAuth } from './auth/AuthContext';
import type { Assignment } from './management/types';
import { NotificationProvider, useNotification } from './components/Notifications';
import { WorkspaceHeader } from './components/shell/WorkspaceHeader';
import { ActionButton } from './components/ui/ActionButton';
import { IncomingCall } from './components/IncomingCall';
import { IncidentList } from './pages/IncidentList';
import { AdvancedIncidentSearch, blankSearch, searchFilter, type SearchDraft } from './pages/IncidentSearch';
import { LoginPage } from './pages/LoginPage';
import { MaterialsMenu } from './management/MaterialsMenu';
import { readCooldown, readManualAvailability, writeManualAvailability } from './operatorAvailability';
import chevronDarkIcon from './assets/workspace/chevron-dark.svg';
import headsetIcon from './assets/workspace/headset.svg';
import resetIcon from './assets/workspace/reset.svg';
import searchIcon from './assets/workspace/search.svg';
import styles from './App.module.css';

const AdminDesk = lazy(() => import('./management/AdminDesk').then((module) => ({ default: module.AdminDesk })));
const InstructorWorkspace = lazy(() => import('./management/InstructorWorkspace').then((module) => ({ default: module.InstructorWorkspace })));
const CardDesk = lazy(() => import('./pages/CardDesk').then((module) => ({ default: module.CardDesk })));
const LearnerProgress = lazy(() => import('./pages/LearnerProgress').then((module) => ({ default: module.LearnerProgress })));
const SpeechPage = lazy(() => import('./pages/SpeechPage').then((module) => ({ default: module.SpeechPage })));

type Session =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User }
  | { status: 'error'; message: string };

function OperatorWorkspace() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const notify = useNotification();
  const lastLoadError = useRef('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [connectionError, setConnectionError] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const advancedSearchRef = useRef<HTMLFormElement>(null);

  const [draft, setDraft] = useState(blankSearch);
  const [applied, setApplied] = useState(blankSearch);
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(Date.now);
  const [manuallyAvailable, setManuallyAvailable] = useState(() => readManualAvailability(user.id));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!advancedOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      const target = event.target as Node;
      if (!searchPanelRef.current?.contains(target) && !advancedSearchRef.current?.contains(target))
        setAdvancedOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setAdvancedOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [advancedOpen]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const [rows, capabilities] = await Promise.all([
          api<Assignment[]>('training/assignments'),
          api<{ speech: boolean }>('training/capabilities'),
        ]);
        if (!cancelled) {
          setAssignments(rows);
          setSpeechEnabled(capabilities.speech);
          setConnectionError(false);
          lastLoadError.current = '';
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Не удалось загрузить список происшествий.';
        if (!cancelled && lastLoadError.current !== message) {
          lastLoadError.current = message;
          setConnectionError(true);
          notify(message, 'error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          if (autoRefresh) timer = setTimeout(() => void read(), 5_000);
        }
      }
    };
    void read();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [autoRefresh, notify]);

  const hasOpenCard = assignments.some((item) => ['created', 'active', 'suspended'].includes(item.attempt_status ?? ''));
  const coolingDown = now < readCooldown(user.id);
  const telephonySupported = window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);
  const available = telephonySupported && speechEnabled && !connectionError && manuallyAvailable && !hasOpenCard && !coolingDown;
  const availabilityLabel = connectionError ? 'Ошибка'
    : !speechEnabled ? 'Звонки отключены'
    : !telephonySupported ? 'Не подключен'
      : available ? 'Доступен' : 'Недоступен';
  const incomingCall = available ? assignments.find((item) => item.mode === 'call' && item.status === 'active'
    && (!item.attempt_status || item.attempt_status === 'failed')) : undefined;
  const cardTask = assignments.find((item) => item.mode === 'card' && item.status === 'active'
    && !['completed', 'failed'].includes(item.attempt_status ?? ''));

  const toggleAvailability = () => {
    if (!telephonySupported || !speechEnabled || connectionError || hasOpenCard || coolingDown) return;
    setManuallyAvailable((current) => {
      writeManualAvailability(user.id, !current);
      return !current;
    });
  };

  const closeIncomingCall = () => {
    writeManualAvailability(user.id, false);
    setManuallyAvailable(false);
  };

  const patchDraft = (patch: Partial<SearchDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const resetAdvanced = () => {
    setDraft(blankSearch());
    setApplied(blankSearch());
  };
  const resetSearch = () => {
    setQuery('');
    resetAdvanced();
  };
  const applySearch = () => setApplied(draft);
  const search = useMemo(() => searchFilter(applied), [applied]);

  return <div className={styles.workspace}>
    <WorkspaceHeader
      menu={<><MaterialsMenu /><button type="button" onClick={() => navigate('/progress')}>Мои результаты</button></>}
      leading={<div ref={searchPanelRef} className={styles.searchPanel}>
        <label className={styles.searchField}>
          <span className={styles.visuallyHidden}>Поиск происшествий</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск происшествий" />
          <img src={searchIcon} alt="" />
        </label>
        <div className={styles.searchRule} />
        <div className={styles.searchFooter}>
          <button onClick={() => setAdvancedOpen((value) => !value)}>
            Расширенный по параметрам <img className={advancedOpen ? styles.chevronUp : ''} src={chevronDarkIcon} alt="" />
          </button>
          <button onClick={resetSearch}>
            <img src={resetIcon} alt="" /> Сбросить
          </button>
        </div>
      </div>}
      footer={<button className={[styles.availability, available ? '' : styles.unavailable,
        !telephonySupported ? styles.disconnected : ''].filter(Boolean).join(' ')}
        onClick={toggleAvailability}
        disabled={!telephonySupported || !speechEnabled || connectionError || hasOpenCard || coolingDown}>
        <img src={headsetIcon} alt="" />
        <span>{availabilityLabel}</span>
      </button>}
    />
    {advancedOpen && <AdvancedIncidentSearch formRef={advancedSearchRef} draft={draft}
      onChange={patchDraft} onApply={applySearch} onReset={resetAdvanced} />}
    {cardTask && <div className={styles.cardOffer}>
      <span>Назначена отработка карточки: {cardTask.title}</span>
      <ActionButton onClick={() => navigate(`/card?assignment_id=${encodeURIComponent(cardTask.id)}`)}>Открыть карточку</ActionButton>
    </div>}
    <div className={styles.operatorContent}>
      <IncidentList assignments={assignments} autoRefresh={autoRefresh} filter={query}
        loading={loading} onAutoRefresh={setAutoRefresh} search={search} />
    </div>

    {incomingCall && <IncomingCall assignment={incomingCall} onClose={closeIncomingCall}
      onAccept={() => navigate(`/session?assignment_id=${encodeURIComponent(incomingCall.id)}`)} />}
  </div>;
}

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
