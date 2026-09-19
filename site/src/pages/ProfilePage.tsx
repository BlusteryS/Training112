import type { ReactNode } from 'react';
import {
  Avatar,
  Button,
  Card,
  HorizontalScroll,
  IconButton,
  Progress,
  Tooltip,
} from '@training112/components';
import { Icon20CheckCircle, Icon20ChevronRight } from '@training112/icons';
import { useAuth } from '../auth/AuthContext';
import { achievements } from './profileAchievements';
import { ProfileHistory } from './ProfileHistory';
import styles from './ProfilePage.module.css';

type StatisticProps = {
  description: string;
  icon: ReactNode;
  label: string;
  lowerIsBetter?: boolean;
  previous: number;
  unit?: string;
  value: number;
};

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const demoStatistics = {
  accuracy: { previous: 73.3, value: 98.4 },
  solved: { previous: 829, value: 798 },
  processingTime: { previous: 22, value: 12 },
};
const demoCalls = [8, 4, 1, 3, 5, 10].map((score, index) => ({
  id: String(6 - index).padStart(6, '0'),
  durationMinutes: 10,
  date: '2026-09-11',
  score,
}));

function Statistic({ description, icon, label, lowerIsBetter = false, previous, unit, value }: StatisticProps) {
  const change = value === previous ? 0 : previous === 0 ? null : (value - previous) / previous;
  const improved = lowerIsBetter ? value < previous : value > previous;
  const trend = change === null || change === 0 ? 'neutral' : improved ? 'positive' : 'negative';
  const percentage = change === null ? '—' : `${numberFormat.format(Math.abs(change) * 100)}%`;

  return (
    <Card
      appearance="primary"
      className={styles.statistic}
      media={<div className={styles.statisticIcon}>{icon}</div>}
      title={
        <div className={styles.values}>
          <span className={styles.comparison}>
            <span>{numberFormat.format(previous)}{unit && ` ${unit}`}</span>
            <Icon20ChevronRight />
            <strong>{numberFormat.format(value)}{unit && ` ${unit}`}</strong>
          </span>
          <span className={styles.change} data-trend={trend}>
            {trend !== 'neutral' ? <span aria-hidden="true" className={styles.trendIcon} /> : null}
            <span>{percentage}</span>
          </span>
        </div>
      }
      subtitle={
        <div className={styles.statisticLabel}>
          <span>{label}</span>
          <Tooltip description={description} title={label}>
            <IconButton aria-label={`Подробнее: ${label}`} size="small">
              <span aria-hidden="true" className={`${styles.icon} ${styles.help}`} />
            </IconButton>
          </Tooltip>
        </div>
      }
      withBorder
    />
  );
}

export function ProfilePage() {
  const { user } = useAuth();

  return (
    <main aria-label="Профиль" className={styles.page}>
      <header className={styles.header}>
        <Avatar name={user.login} size={72} variant="color" />
        <div className={styles.heading}>
          <h1 className={styles.name}>{user.login}</h1>
          <p className={styles.subtitle}>Это ваш профиль</p>
        </div>
      </header>

      <section aria-label="Статистика" className={styles.statistics}>
        <Statistic
          {...demoStatistics.accuracy}
          description="Показывает, насколько точно заполнена информация по запросам."
          icon={<Progress aria-label="Точность информации" className={styles.accuracy} value={demoStatistics.accuracy.value} />}
          label="Точность информации"
        />
        <Statistic
          {...demoStatistics.solved}
          description="Количество запросов, обработка которых завершена."
          icon={<Icon20CheckCircle />}
          label="Запросов решено"
        />
        <Statistic
          {...demoStatistics.processingTime}
          description="Среднее время от начала обработки запроса до её завершения."
          icon={<span aria-hidden="true" className={`${styles.icon} ${styles.time}`} />}
          label="Ср. время обработки"
          lowerIsBetter
          unit="мин."
        />
      </section>

      <div className={styles.shift}>
        <Button appearance="positive" className={styles.shiftButton} disabled size="large">
          Начать смену
        </Button>
      </div>

      <section aria-labelledby="profile-achievements">
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="profile-achievements">Достижения</h2>
          <p className={styles.subtitle}>Здесь хранятся ваши достижения</p>
        </header>
        <HorizontalScroll aria-label="Доступные достижения" bleed>
          <div className={styles.achievements} role="list">
            {achievements.map(({ title, description, image }) => (
              <Card
                className={styles.achievement}
                key={title}
                media={<img alt="" className={styles.illustration} height={124} loading="lazy" src={image} width={202} />}
                role="listitem"
                subtitle={description}
                title={<h3 className={styles.achievementTitle}>{title}</h3>}
              />
            ))}
          </div>
        </HorizontalScroll>
      </section>

      <ProfileHistory calls={demoCalls} />
    </main>
  );
}
