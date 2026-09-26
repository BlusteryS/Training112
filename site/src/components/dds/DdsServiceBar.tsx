import { useState } from 'react';
import type { AttemptEvent } from '../../speech/trainingApi';
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

function currentStatus(status: string, now: number, started: number | null) {
  if (['added', 'received'].includes(status) && started && now - started > 30_000) return 'Не оповещено';
  return labels[status] ?? status;
}

export function DdsServiceBar({ services, ownService, ownStatus, events, login, now, startedAt }: {
  services: string[];
  ownService: string;
  ownStatus: string;
  events: AttemptEvent[];
  login: string;
  now: number;
  startedAt: number | null;
}) {
  const [selected, setSelected] = useState(ownService);
  const [expanded, setExpanded] = useState(false);
  const current = services.some((service) => sameService(service, selected)) ? selected : ownService;
  const own = sameService(current, ownService);
  const history = events.filter((event) => ['card.status', 'dds.crew.select', 'dds.phone.report'].includes(event.type));
  return <div className={styles.dock}>
    {expanded && <div className={styles.detail}>
      <div className={styles.detailTitle}>{current} · {own ? currentStatus(ownStatus, now, startedAt) : labels.added}</div>
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
      </div> : <div className={styles.otherNotice}>Статус другой службы в этом занятии не обновляется.</div>}
    </div>}
    <div className={styles.tabs}>
      <span className={styles.tabsLabel}>Службы:</span>
      {services.map((service) => {
        const isOwn = sameService(service, ownService);
        return <button type="button" key={service} className={sameService(service, current) ? styles.selected : ''}
          onClick={() => {
            if (sameService(service, current)) setExpanded((open) => !open);
            else { setSelected(service); setExpanded(true); }
          }} aria-current={sameService(service, current) ? 'true' : undefined} aria-expanded={expanded && sameService(service, current)}>
          <span>{service}</span><small>{isOwn ? currentStatus(ownStatus, now, startedAt) : labels.added}</small>
        </button>;
      })}
    </div>
  </div>;
}
