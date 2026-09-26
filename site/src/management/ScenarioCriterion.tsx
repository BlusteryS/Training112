import { InputField } from '../components/ui/InputField';
import type { ScenarioDocument } from './types';
import styles from './ScenarioCriterion.module.css';

type Criterion = ScenarioDocument['rubric'][number];

export function ScenarioCriterion({ rule, number, fieldName, onChange }: {
  rule: Criterion;
  number: number;
  fieldName?: string;
  onChange: (changes: Partial<Criterion>) => void;
}) {
  return <div className={styles.card}>
    <div className={styles.heading}>
      <span className={styles.number}>{number}</span>
      <div className={styles.headingText}>
        <div className={styles.title}>{rule.description}</div>
        {fieldName && <div className={styles.fieldName}>Проверяемое поле: {fieldName}</div>}
      </div>
    </div>
    <div className={styles.controls}>
      {rule.kind === 'deadline' && <InputField label="Время на сохранение карточки, секунд" required
        type="number" min={1} max={86400} value={rule.seconds ?? 30}
        onChange={(event) => {
          const seconds = Number(event.target.value);
          onChange({ seconds, description: `Карточка сохранена в течение ${seconds} секунд.` });
        }} />}
      <div className={styles.settings}>
        <InputField label="Баллы" type="number" min={1} max={100} value={rule.weight}
          onChange={(event) => onChange({ weight: Number(event.target.value) })} />
        <label className={styles.mandatory}>
          <input type="checkbox" checked={rule.mandatory ?? false}
            onChange={(event) => onChange({ mandatory: event.target.checked })} />
          Обязательно для зачёта
        </label>
      </div>
    </div>
  </div>;
}
