import { useState } from 'react';
import { Card, Cell, Placeholder, Search, Separator } from '@training112/components';
import { Icon20CheckCircle, Icon20ChevronRight, Icon20CircleDashed, Icon20Warning } from '@training112/icons';
import styles from './ProfileHistory.module.css';

type ProfileCall = {
  id: string;
  durationMinutes: number;
  date: string;
  score: number;
};

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function getMetadata(call: ProfileCall) {
  return `${call.durationMinutes} мин · ${dateFormat.format(new Date(call.date)).replace(' г.', '')}`;
}

export function ProfileHistory({ calls }: { calls: readonly ProfileCall[] }) {
  const [query, setQuery] = useState('');
  const searchTerms = query.trim().toLocaleLowerCase('ru-RU').split(/\s+/u);
  const visibleCalls = calls.filter((call) => {
    const metadata = `#${call.id} ${getMetadata(call)} ${call.score} из 10 баллов`.toLocaleLowerCase('ru-RU');
    return searchTerms.every((term) => metadata.includes(term));
  });

  if (calls.length === 0) return null;

  return (
    <section aria-label="История запросов" className={styles.history}>
      <Separator className={styles.separator} />
      <div className={styles.search}>
        <Search
          aria-label="Поиск по метаданным запросов"
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Поиск по метаданным"
          value={query}
        />
      </div>
      {visibleCalls.length > 0 ? (
        <div className={styles.cards} role="list">
          {visibleCalls.map((call) => (
            <Card className={styles.card} key={call.id} role="listitem">
              <Cell subtitle={getMetadata(call)} title={`#${call.id}`} />
              <Separator className={styles.separator} />
              <Cell
                after={<Icon20ChevronRight />}
                before={call.score >= 8
                  ? <Icon20CheckCircle className={styles.successIcon} />
                  : call.score >= 5
                    ? <Icon20Warning className={styles.warningIcon} />
                    : <Icon20CircleDashed className={styles.secondaryIcon} />}
                className={styles.result}
                subtitle="Посмотрите итоги"
                title={`${call.score} из 10 баллов`}
              />
            </Card>
          ))}
        </div>
      ) : (
        <Placeholder subtitle="Попробуйте изменить поисковый запрос." title="Запросы не найдены" />
      )}
    </section>
  );
}
