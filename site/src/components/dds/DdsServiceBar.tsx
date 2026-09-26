import { useState } from 'react';
import type { AttemptEvent, DdsServiceState } from '../../speech/trainingApi';
import { sameService } from './serviceName';
import styles from './DdsServiceBar.module.css';

const labels: Record<string, string> = {
  added: 'Добавлена', received: 'Получена', accepted: 'Принята', rejected: 'Не принята',
  dispatched: 'Начало реагирования', arrived: 'Прибытие', working: 'Проведение работ',
  completed: 'Работы завершены', refused: 'Отказ от выполнения работ',
};

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

function currentStatus(state: DdsServiceState | undefined, now: number, fallbackStart: number | null) {
  const status = state?.status ?? 'added';
  const started = state?.started_at ? new Date(state.started_at).valueOf() : fallbackStart;
  if (['added', 'received'].includes(status) && started && now - started > 30_000) return 'Не оповещено';
  return labels[status] ?? status;
}

export function DdsServiceBar({ services, ownService, ownStatus, serviceStates, events, login, now, startedAt }: {
  services: string[];
  ownService: string;
  ownStatus: string;
  serviceStates: DdsServiceState[];
  events: AttemptEvent[];
  login: string;
  now: number;
  startedAt: number | null;
}) {
  const [selected, setSelected] = useState(ownService);
  const current = services.some((service) => sameService(service, selected)) ? selected : ownService;
  const own = sameService(current, ownService);
  const ownState = { service: ownService, status: ownStatus,
    started_at: startedAt ? new Date(startedAt).toISOString() : null, history: [] };
  const state = own ? ownState : serviceStates.find((item) => sameService(item.service, current));
  const history = events.filter((event) => ['card.status', 'dds.crew.select', 'dds.phone.report'].includes(event.type));
  return <div className={styles.dock}>
    <div className={styles.detail}>
      <div className={styles.detailTitle}>{current} · {currentStatus(state, now, startedAt)}</div>
      {own ? <div className={styles.history}>
        {history.length === 0 ? <span>История статусов появится здесь после первого действия.</span> : history.map((event, index) =>
          <div key={`${event.created_at}-${index}`}>
            <span>{timeFormatter.format(new Date(event.created_at))}</span>
            <span>{event.type === 'card.status' ? labels[event.payload.status ?? ''] ?? event.payload.status
              : event.type === 'dds.crew.select' ? `Назначена ${event.payload.crew}`
                : `${event.payload.direction === 'incoming' ? 'Входящий' : 'Исходящий'} звонок: ${event.payload.party === 'crew' ? 'старший бригады' : 'заявитель'}`}</span>
            <span>{event.payload.status === 'received' ? 'Система' : login}</span>
            {(event.payload.comment || event.payload.message) && <span>{event.payload.comment || event.payload.message}</span>}
          </div>)}
      </div> : state?.history?.length ? <div className={styles.history}>
        {state.history.map((item, index) => <div key={`${item.created_at}-${index}`}>
          <span>{timeFormatter.format(new Date(item.created_at))}</span>
          <span>{labels[item.status] ?? item.status}</span>
          <span>{item.actor}</span>
          <span>{item.comment}</span>
        </div>)}
      </div> : <div className={styles.otherNotice}>Пока нет изменений статуса этой службы.</div>}
    </div>
    <div className={styles.tabs}>
      <span className={styles.tabsLabel}>Службы:</span>
      {services.map((service) => {
        const serviceState = sameService(service, ownService) ? ownState
          : serviceStates.find((item) => sameService(item.service, service));
        return <button type="button" key={service} className={sameService(service, current) ? styles.selected : ''}
          onClick={() => setSelected(service)} aria-current={sameService(service, current) ? 'true' : undefined}>
          <span>{service}</span><small>{currentStatus(serviceState, now, startedAt)}</small>
        </button>;
      })}
    </div>
  </div>;
}
