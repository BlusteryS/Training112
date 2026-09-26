import styles from './EvaluationDetails.module.css';

export type Evaluation = {
  result: {
    score: number | null;
    passed?: boolean | null;
    earned: number;
    possible: number;
    checks: { id: string; description: string; status: string; actual?: string; expected?: string }[];
    recommendations?: string[];
    attempt_status?: string;
  };
  reviews: { reason: string; result: { score?: number; recommendation?: string }; created_at: string }[];
};

const statusNames: Record<string, string> = {
  passed: 'Выполнено', failed: 'Не выполнено', review: 'На проверке',
};

export function EvaluationDetails({ evaluation }: { evaluation: Evaluation }) {
  const { result, reviews } = evaluation;
  return <div className={styles.details}>
    <div className={styles.score}>{result.attempt_status === 'failed' ? 'Попытка прервана'
      : result.score === null ? 'Оценка требует проверки преподавателя'
      : `Автоматическая оценка: ${result.score} / 100`}</div>
    {result.attempt_status !== 'failed' && <div>{result.earned} из {result.possible} баллов по критериям</div>}
    {result.attempt_status !== 'failed' && result.passed !== undefined && <div>{result.passed === null ? 'Итог требует проверки' : result.passed ? 'Требования выполнены' : 'Требования не выполнены'}</div>}
    {result.attempt_status !== 'failed' && result.checks.map((check) => <div className={styles.check} key={check.id}>
      <div>{check.description} — {statusNames[check.status] ?? check.status}</div>
      {check.status === 'review' && check.actual !== undefined && <div>Ответ: {check.actual || 'не заполнено'}</div>}
      {check.status === 'review' && check.expected !== undefined && <div>Эталон: {check.expected}</div>}
    </div>)}
    {result.attempt_status !== 'failed' && result.recommendations?.map((item) => <div className={styles.recommendation} key={item}>{item}</div>)}
    {reviews.map((item) => <div className={styles.review} key={item.created_at}>
      Экспертная оценка: {item.result.score ?? 'без балла'} · {item.reason}
      {item.result.recommendation && <div>{item.result.recommendation}</div>}
    </div>)}
  </div>;
}
