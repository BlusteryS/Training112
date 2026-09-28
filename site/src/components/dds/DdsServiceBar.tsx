import { useState } from 'react';
import type { AttemptEvent, DdsServiceStatus } from '../../speech/trainingApi';
import { sameService } from './serviceName';
import { ddsPartyNames, ddsStatusNames } from './statuses';
import styles from './DdsServiceBar.module.css';

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

function currentStatus(status: string, now: number, started: number | null) {
  if ((status === 'added' || status === 'received') && started && now - started > 30_000)
    return 'Не оповещено';
  return ddsStatusNames[status] ?? status;
}

export function DdsServiceBar({ services, ownService, ownStatus, events, login, now, startedAt, serviceStatuses }: {
  services: string[];
  ownService: string;
  ownStatus: string;
  events: AttemptEvent[];
  login: string;
  now: number;
  startedAt: number | null;
  serviceStatuses: DdsServiceStatus[];
}) {
  const [selected, setSelected] = useState(ownService);
  const [expanded, setExpanded] = useState(false);
  const current = services.some((service) => sameService(service, selected)) ? selected : ownService;
  const own = sameService(current, ownService);
  const statusFor = (service: string) => {
    if (sameService(service, ownService)) return currentStatus(ownStatus, now, startedAt);
    const latest = serviceStatuses.find((item) => sameService(item.service, service));
    return latest ? currentStatus(latest.status, now,
      latest.started_at ? new Date(latest.started_at).valueOf() : null)
      : currentStatus('added', now, startedAt);
  };
  const history = events.filter((event) => ['card.status', 'dds.crew.select', 'dds.phone.report'].includes(event.type));
  const otherHistory = serviceStatuses.find((item) => sameService(item.service, current))?.history ?? [];
  return <div className={styles.dock}>
    {expanded && <div className={styles.detail}>
      <div className={styles.detailTitle}>{current} · {statusFor(current)}</div>
      {own ? <div className={styles.history}>
        {history.length === 0 ? <span>История статусов появится здесь после первого действия.</span> : history.map((event, index) =>
          <div key={`${event.created_at}-${index}`}>
            <span>{timeFormatter.format(new Date(event.created_at))}</span>
            <span>{event.type === 'card.status' ? ddsStatusNames[event.payload.status ?? ''] ?? event.payload.status
              : event.type === 'dds.crew.select' ? `Назначена ${event.payload.crew}`
                : `${event.payload.direction === 'incoming' ? 'Входящий' : 'Исходящий'} звонок: ${ddsPartyNames[event.payload.party ?? ''] ?? event.payload.party}`}</span>
            <span>{event.payload.status === 'received' ? 'Система' : login}</span>
            {(event.payload.comment || event.payload.message) && <span>{event.payload.comment || event.payload.message}</span>}
          </div>)}
      </div> : <div className={styles.history}>
        {otherHistory.length === 0 ? <span>Записей о реагировании пока нет.</span> : otherHistory.map((entry, index) =>
          <div key={`${entry.created_at}-${index}`}>
            <span>{timeFormatter.format(new Date(entry.created_at))}</span>
            <span>{ddsStatusNames[entry.status] ?? entry.status}</span>
            <span>{current}</span>
            <span>{entry.comment}</span>
          </div>)}
      </div>}
    </div>}
    <div className={styles.tabs}>
      <span className={styles.tabsLabel}>Службы:</span>
      {services.map((service) => {
        return <button type="button" key={service} className={sameService(service, current) ? styles.selected : ''}
          onClick={() => {
            if (sameService(service, current)) setExpanded((open) => !open);
            else { setSelected(service); setExpanded(true); }
          }} aria-current={sameService(service, current) ? 'true' : undefined} aria-expanded={expanded && sameService(service, current)}>
          <span>{service}</span><small>{statusFor(service)}</small>
        </button>;
      })}
    </div>
  </div>;
}
