import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api';
import { ApiError, authApi, type User } from './auth/api';
import { AuthContext, useAuth } from './auth/AuthContext';
import { Management } from './management/Management';
import type { Assignment } from './management/types';
import { NotificationProvider, useNotification } from './components/Notifications';
import { IncomingCall } from './components/IncomingCall';
import { IncidentList } from './pages/IncidentList';
import { LoginPage } from './pages/LoginPage';
import { SpeechPage } from './pages/SpeechPage';
import { readCooldown, readManualAvailability, writeManualAvailability } from './operatorAvailability';
import chevronDarkIcon from './assets/workspace/chevron-dark.svg';
import headsetIcon from './assets/workspace/headset.svg';
import helpIcon from './assets/workspace/help.svg';
import resetIcon from './assets/workspace/reset.svg';
import searchIcon from './assets/workspace/search.svg';
import workstationIcon from './assets/workspace/workstation.svg';
import styles from './App.module.css';

type Session =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User }
  | { status: 'error'; message: string };

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit', minute: '2-digit', hour12: false,
});

function displayDate(value: Date) {
  const formatted = dateFormatter.format(value).replace(/\sг\.$/, '');
  return formatted.charAt(0).toLocaleUpperCase('ru') + formatted.slice(1);
}

function operatorNumber(login: string) {
  return login.match(/\d+/)?.[0] ?? login;
}

function operatorLabel(login: string) {
  const number = login.match(/\d+/)?.[0];
  return number ? `оп. ${number}, ${login}` : `оп. ${login}`;
}

function OperatorWorkspace() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const notify = useNotification();
  const lastLoadError = useRef('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [addressFilter, setAddressFilter] = useState('');
  const [incidentFilter, setIncidentFilter] = useState('');
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(Date.now);
  const [manuallyAvailable, setManuallyAvailable] = useState(() => readManualAvailability(user.id));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const rows = await api<Assignment[]>('training/assignments');
        if (!cancelled) {
          setAssignments(rows);
          lastLoadError.current = '';
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Не удалось загрузить список происшествий.';
        if (!cancelled && lastLoadError.current !== message) {
          lastLoadError.current = message;
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

  const currentTime = new Date(now);
  const workstation = (user.workstation ?? '000').padStart(3, '0');
  const hasOpenCard = assignments.some((item) => ['created', 'active', 'suspended'].includes(item.attempt_status ?? ''));
  const coolingDown = now < readCooldown(user.id);
  const available = manuallyAvailable && !hasOpenCard && !coolingDown;
  const incomingCall = available ? assignments.find((item) => item.mode === 'call' && item.status === 'active'
    && (!item.attempt_status || item.attempt_status === 'failed')) : undefined;

  const toggleAvailability = () => {
    if (hasOpenCard || coolingDown) return;
    setManuallyAvailable((current) => {
      writeManualAvailability(user.id, !current);
      return !current;
    });
  };

  const closeIncomingCall = () => {
    writeManualAvailability(user.id, false);
    setManuallyAvailable(false);
  };

  return <div className={styles.workspace}>
    <div className={styles.operatorHeader}>
      <div className={styles.searchPanel}>
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
          <button onClick={() => { setQuery(''); setAddressFilter(''); setIncidentFilter(''); }}>
            <img src={resetIcon} alt="" /> Сбросить
          </button>
        </div>
        {advancedOpen && <div className={styles.advancedSearch}>
          <label><span>Тип происшествия</span><input value={incidentFilter}
            onChange={(event) => setIncidentFilter(event.target.value)} /></label>
          <label><span>Адрес</span><input value={addressFilter}
            onChange={(event) => setAddressFilter(event.target.value)} /></label>
        </div>}
      </div>

      <div className={styles.statusPanel}>
        <div className={styles.statusTop}>
          <div className={styles.operatorInfo}>
            <div>{displayDate(currentTime)}</div>
            <div className={styles.operatorMeta}>
              <span>{operatorLabel(user.login)}</span>
              <span><img src={workstationIcon} alt="" /> АРМ {workstation}</span>
              <div className={styles.helpMenu}>
                <button className={styles.helpButton} onClick={() => setMenuOpen((value) => !value)} title="Справка и выход">
                  <img src={helpIcon} alt="" />
                </button>
                {menuOpen && <div className={styles.sessionMenu}>
                  <button onClick={() => { void logout().catch((cause: unknown) => {
                    notify(cause instanceof Error ? cause.message : 'Не удалось выйти из системы.', 'error');
                  }); }}>Выйти из системы</button>
                </div>}
              </div>
            </div>
          </div>
          <div className={styles.clock}>{timeFormatter.format(currentTime)}<span>:{currentTime.getSeconds().toString().padStart(2, '0')}</span></div>
        </div>
        <button className={`${styles.availability} ${available ? '' : styles.unavailable}`}
          onClick={toggleAvailability} disabled={hasOpenCard || coolingDown}>
          <img src={headsetIcon} alt="" />
          <span>{available ? 'Доступен' : 'Недоступен'}</span>
        </button>
      </div>
    </div>
    <div className={styles.operatorContent}>
      <IncidentList addressFilter={addressFilter} assignments={assignments} autoRefresh={autoRefresh}
        filter={query} incidentFilter={incidentFilter}
        loading={loading} onAutoRefresh={setAutoRefresh} user={{ ...user, workstation }} />
    </div>
    {incomingCall && <IncomingCall assignment={incomingCall} onClose={closeIncomingCall}
      onAccept={() => navigate(`/session?assignment_id=${encodeURIComponent(incomingCall.id)}`)} />}
  </div>;
}

function ManagementWorkspace() {
  const { user, logout } = useAuth();
  const notify = useNotification();
  const [filter, setFilter] = useState('');
  return <div className={styles.managementPage}>
    <div className={styles.managementHeader}>
      <div>{user.role === 'admin' ? 'Администрирование' : 'Кабинет преподавателя'}</div>
      <label>
        <span className={styles.visuallyHidden}>Поиск</span>
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Поиск" />
      </label>
      <div>{user.login}</div>
      <button onClick={() => { void logout().catch((cause: unknown) => {
        notify(cause instanceof Error ? cause.message : 'Не удалось выйти из системы.', 'error');
      }); }}>Выйти</button>
    </div>
    <Management filter={filter} />
  </div>;
}

function Home() {
  return useAuth().user.role === 'user' ? <OperatorWorkspace /> : <ManagementWorkspace />;
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
          <Routes>
            <Route element={session.user.role === 'user' ? <SpeechPage /> : <Navigate replace to="/" />} path="/session" />
            <Route element={<Home />} path="/" />
            <Route element={<Navigate replace to="/" />} path="*" />
          </Routes>
        </AuthContext.Provider>;
}

export function App() {
  return <NotificationProvider><Application /></NotificationProvider>;
}
