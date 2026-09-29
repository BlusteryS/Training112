import { questionsFor } from './incidentQuestionSet';
import type { ClassifierCard } from '../../pages/incidentClassifier';
import styles from './IncidentQuestions.module.css';

export function IncidentQuestions({ card, answers, onChange }: {
  card: ClassifierCard;
  answers: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return <div className={styles.questions}>
    <div className={styles.title}>Уточнения</div>
    {questionsFor(card).map((question) => <div className={styles.question} key={question.key}>
      <span>{question.label}</span>
      {question.options ? <div className={styles.choices}>{question.options.map((option) => {
        const selected = question.multiple
          ? (answers[question.key] ?? '').split('|').includes(option)
          : answers[question.key] === option;
        return <button key={option} type="button" aria-pressed={selected}
          className={selected ? styles.selected : ''} onClick={() => {
            if (!question.multiple) { onChange(question.key, selected ? '' : option); return; }
            const values = (answers[question.key] ?? '').split('|').filter(Boolean);
            onChange(question.key, (selected ? values.filter((value) => value !== option)
              : [...values, option]).join('|'));
          }}><span>{option}</span></button>;
      })}</div> : <input aria-label={question.label} value={answers[question.key] ?? ''}
        onChange={(event) => onChange(question.key, event.target.value)} />}
    </div>)}
  </div>;
}
