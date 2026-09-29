import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import type { Assignment } from '../management/types';
import { useNotification } from '../components/Notifications';
import { WorkspaceHeader } from '../components/shell/WorkspaceHeader';
import { ActionButton } from '../components/ui/ActionButton';
import { IncomingCall } from '../components/IncomingCall';
import { IncidentList } from './IncidentList';
import { AdvancedIncidentSearch, blankSearch, searchFilter, type SearchDraft } from './IncidentSearch';
import { MaterialsMenu } from '../management/MaterialsMenu';
import { readCooldown, readManualAvailability, writeManualAvailability } from '../operatorAvailability';
import { useNow } from '../hooks/useNow';
import chevronDarkIcon from '../assets/workspace/chevron-dark.svg';
import headsetIcon from '../assets/workspace/headset.svg';
import resetIcon from '../assets/workspace/reset.svg';
import searchIcon from '../assets/workspace/search.svg';
import styles from '../App.module.css';

export function OperatorWorkspace() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
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
  const now = useNow();
  const [manuallyAvailable, setManuallyAvailable] = useState(() => readManualAvailability(user.id));
  const moduleId = params.get('module_id') ?? '';
  const moduleOptions = useMemo(() => [...new Map(assignments.flatMap((item) =>
    item.module_id && item.module_title ? [[item.module_id, item.module_title] as const] : [])).entries()], [assignments]);
  const visibleAssignments = moduleId ? assignments.filter((item) => item.module_id === moduleId) : assignments;

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
    const controller = new AbortController();
    const read = async () => {
      try {
        const [rows, capabilities] = await Promise.all([
          api<Assignment[]>('training/assignments', undefined, controller.signal),
          api<{ speech: boolean }>('training/capabilities', undefined, controller.signal),
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
      controller.abort();
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
  const incomingCall = available ? visibleAssignments.find((item) => item.mode === 'call' && item.status === 'active'
    && (!item.attempt_status || item.attempt_status === 'failed')) : undefined;
  const cardTask = visibleAssignments.find((item) => item.mode === 'card' && item.status === 'active'
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
      <IncidentList assignments={visibleAssignments} autoRefresh={autoRefresh} filter={query}
        userId={user.id} now={now}
        moduleId={moduleId} moduleOptions={moduleOptions} onModuleChange={(value) => {
          setParams((current) => { const next = new URLSearchParams(current); if (value) next.set('module_id', value); else next.delete('module_id'); return next; });
        }}
        loading={loading} onAutoRefresh={setAutoRefresh} search={search} />
    </div>

    {incomingCall && <IncomingCall assignment={incomingCall} onClose={closeIncomingCall}
      onAccept={() => navigate(`/session?assignment_id=${encodeURIComponent(incomingCall.id)}`)} />}
  </div>;
}
