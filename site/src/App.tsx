import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
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
import searchClockIcon from './assets/workspace/search-clock.svg';
import searchIcon from './assets/workspace/search.svg';
import searchPlusIcon from './assets/workspace/search-plus.svg';
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

type DateParts = { hh: string; mm: string; dd: string; mo: string; yyyy: string };

type AdvancedDraft = {
  from: DateParts;
  to: DateParts;
  incident: string;
  signs: string;
  address: string;
  okrug: string;
  district: string;
  region: string;
  caller: string;
  operator: string;
  arm: string;
  descriptiveAddress: string;
  service: string;
  description: string;
  channel: string;
  source: string;
  status: string;
  cardNumber: string;
  visOperator: string;
};

const blankDate = (): DateParts => ({ hh: '', mm: '', dd: '', mo: '', yyyy: '' });

const blankAdvanced = (): AdvancedDraft => ({
  from: blankDate(), to: blankDate(),
  incident: '', signs: '', address: '', okrug: '', district: '', region: '',
  caller: '', operator: '', arm: '', descriptiveAddress: '', service: '',
  description: '', channel: '', source: '', status: '', cardNumber: '', visOperator: '',
});

function dateBound(parts: DateParts, end: boolean) {
  if (!Object.values(parts).some(Boolean)) return null;
  const year = Number(parts.yyyy);
  const month = Number(parts.mo);
  const day = Number(parts.dd);
  const hours = parts.hh === '' ? (end ? 23 : 0) : Number(parts.hh);
  const minutes = parts.mm === '' ? (end ? 59 : 0) : Number(parts.mm);
  if (![year, month, day, hours, minutes].every(Number.isInteger)) return Number.NaN;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hours > 23 || minutes > 59 || year < 1) return Number.NaN;
  const date = new Date(year, month - 1, day, hours, minutes, end ? 59 : 0, end ? 999 : 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return Number.NaN;
  return date.valueOf();
}

function setDigits(value: string, max: number) {
  return value.replace(/\D/g, '').slice(0, max);
}

function DateBound({ label, value, onChange }: {
  label: string;
  value: DateParts;
  onChange: (next: DateParts) => void;
}) {
  const change = (key: keyof DateParts, max: number) => (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, [key]: setDigits(event.target.value, max) });
  };
  return <div className={styles.dateBound}>
    <div className={styles.dateCluster}>
      <input aria-label={`${label}, часы`} className={styles.digit2} inputMode="numeric" value={value.hh} onChange={change('hh', 2)} />
      <span className={styles.dateSep}>:</span>
      <input aria-label={`${label}, минуты`} className={styles.digit2} inputMode="numeric" value={value.mm} onChange={change('mm', 2)} />
      <img src={searchClockIcon} alt="" />
    </div>
    <div className={styles.dateCluster}>
      <input aria-label={`${label}, день`} className={styles.digit2} inputMode="numeric" value={value.dd} onChange={change('dd', 2)} />
      <span className={styles.dateSep}>.</span>
      <input aria-label={`${label}, месяц`} className={styles.digit2} inputMode="numeric" value={value.mo} onChange={change('mo', 2)} />
      <span className={styles.dateSep}>.</span>
      <input aria-label={`${label}, год`} className={styles.digit4} inputMode="numeric" value={value.yyyy} onChange={change('yyyy', 4)} />
      <img src={searchClockIcon} alt="" />
    </div>
  </div>;
}

function AdvancedField({ label, placeholder, value, onChange, wide }: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  return <label className={wide ? `${styles.advancedField} ${styles.advancedFieldWide}` : styles.advancedField}>
    <span>{label}</span>
    <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  </label>;
}

function OperatorWorkspace() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const notify = useNotification();
  const lastLoadError = useRef('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [connectionError, setConnectionError] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [draft, setDraft] = useState(blankAdvanced);
  const [applied, setApplied] = useState(blankAdvanced);
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

  const currentTime = new Date(now);
  const workstation = (user.workstation ?? '000').padStart(3, '0');
  const hasOpenCard = assignments.some((item) => ['created', 'active', 'suspended'].includes(item.attempt_status ?? ''));
  const coolingDown = now < readCooldown(user.id);
  const telephonySupported = window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);
  const available = telephonySupported && !connectionError && manuallyAvailable && !hasOpenCard && !coolingDown;
  const availabilityLabel = connectionError ? 'Ошибка'
    : !telephonySupported ? 'Не подключен'
      : available ? 'Доступен' : 'Недоступен';
  const incomingCall = available ? assignments.find((item) => item.mode === 'call' && item.status === 'active'
    && (!item.attempt_status || item.attempt_status === 'failed')) : undefined;

  const toggleAvailability = () => {
    if (!telephonySupported || connectionError || hasOpenCard || coolingDown) return;
    setManuallyAvailable((current) => {
      writeManualAvailability(user.id, !current);
      return !current;
    });
  };

  const closeIncomingCall = () => {
    writeManualAvailability(user.id, false);
    setManuallyAvailable(false);
  };

  const patchDraft = (patch: Partial<AdvancedDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const resetAdvanced = () => {
    setDraft(blankAdvanced());
    setApplied(blankAdvanced());
  };
  const resetSearch = () => {
    setQuery('');
    resetAdvanced();
  };
  const applySearch = () => setApplied(draft);
  const search = useMemo(() => ({
    from: dateBound(applied.from, false),
    to: dateBound(applied.to, true),
    incident: applied.incident,
    signs: applied.signs,
    address: applied.address,
    okrug: applied.okrug,
    district: applied.district,
    region: applied.region,
    caller: applied.caller,
    operator: applied.operator,
    arm: applied.arm,
    descriptiveAddress: applied.descriptiveAddress,
    service: applied.service,
    description: applied.description,
    channel: applied.channel,
    source: applied.source,
    status: applied.status,
    cardNumber: applied.cardNumber,
    visOperator: applied.visOperator,
  }), [applied]);

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
          <button onClick={resetSearch}>
            <img src={resetIcon} alt="" /> Сбросить
          </button>
        </div>
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
        <button className={[styles.availability, available ? '' : styles.unavailable,
          !telephonySupported ? styles.disconnected : ''].filter(Boolean).join(' ')}
          onClick={toggleAvailability}
          disabled={!telephonySupported || connectionError || hasOpenCard || coolingDown}>
          <img src={headsetIcon} alt="" />
          <span>{availabilityLabel}</span>
        </button>
      </div>
    </div>
    {advancedOpen && <form className={styles.advancedSearch} onSubmit={(event) => { event.preventDefault(); applySearch(); }}>
      <div className={styles.dateRow}>
        <div>Искать по времени и дате:</div>
        <div className={styles.dateRange}>
          <DateBound label="Начало" value={draft.from} onChange={(from) => patchDraft({ from })} />
          <span className={styles.dateDash}>—</span>
          <DateBound label="Конец" value={draft.to} onChange={(to) => patchDraft({ to })} />
        </div>
      </div>
      <div className={styles.advancedGrid}>
        <AdvancedField label="Тип происшествия" placeholder="Тип происшествия" value={draft.incident}
          onChange={(incident) => patchDraft({ incident })} />
        <AdvancedField label="Признаки происшествия:" value={draft.signs}
          onChange={(signs) => patchDraft({ signs })} />
        <AdvancedField label="По адресу:" value={draft.address}
          onChange={(address) => patchDraft({ address })} />
        <AdvancedField label="По округу:" value={draft.okrug}
          onChange={(okrug) => patchDraft({ okrug })} />
        <AdvancedField label="По району:" value={draft.district}
          onChange={(district) => patchDraft({ district })} />
        <AdvancedField label="По субъекту:" placeholder="По субъекту" value={draft.region}
          onChange={(region) => patchDraft({ region })} />
        <AdvancedField label="По заявителю (ФИО/АОН):" value={draft.caller}
          onChange={(caller) => patchDraft({ caller })} />
        <AdvancedField label="По оператору:" value={draft.operator}
          onChange={(operator) => patchDraft({ operator })} />
        <AdvancedField label="По АРМу:" placeholder="По АРМу" value={draft.arm}
          onChange={(arm) => patchDraft({ arm })} />
        <AdvancedField label="По описательному адресу:" value={draft.descriptiveAddress}
          onChange={(descriptiveAddress) => patchDraft({ descriptiveAddress })} />
        <AdvancedField label="По службе:" placeholder="По службе" value={draft.service}
          onChange={(service) => patchDraft({ service })} />
        <AdvancedField label="По описанию:" value={draft.description}
          onChange={(description) => patchDraft({ description })} />
        <AdvancedField label="Канал связи:" placeholder="Канал связи" value={draft.channel}
          onChange={(channel) => patchDraft({ channel })} />
        <AdvancedField label="Источник происшествия:" placeholder="Источник происшествия" value={draft.source}
          onChange={(source) => patchDraft({ source })} />
        <AdvancedField label="Статус:" placeholder="Статус" value={draft.status}
          onChange={(status) => patchDraft({ status })} />
        <AdvancedField label="По номеру карточки:" value={draft.cardNumber}
          onChange={(cardNumber) => patchDraft({ cardNumber })} />
        <AdvancedField wide label="По оператору, работавшему с КП из ВИС:" value={draft.visOperator}
          onChange={(visOperator) => patchDraft({ visOperator })} />
      </div>
      <div className={styles.advancedActions}>
        <button type="submit"><img src={searchPlusIcon} alt="" /> Искать по параметрам</button>
        <button type="button" onClick={resetAdvanced}><img src={searchPlusIcon} alt="" /> Сбросить</button>
      </div>
    </form>}
    <div className={styles.operatorContent}>
      <IncidentList assignments={assignments} autoRefresh={autoRefresh} filter={query}
        loading={loading} onAutoRefresh={setAutoRefresh} search={search} />
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
