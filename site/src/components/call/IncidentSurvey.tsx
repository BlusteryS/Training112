import { incidentOptions, matchingCard, type ClassifierCard } from '../../pages/incidentClassifier';
import styles from './IncidentSurvey.module.css';

export type SurveySelection = { type: string; sign2: string; sign3: string };

export function IncidentSurvey({ cards, types, value, listId, onChange, onRemove }: {
  cards: ClassifierCard[];
  types: string[];
  value: SurveySelection;
  listId: string;
  onChange: (value: SurveySelection) => void;
  onRemove?: () => void;
}) {
  const second = incidentOptions(cards, value.type);
  const third = incidentOptions(cards, value.type, value.sign2);
  const match = matchingCard(cards, value.type, value.sign2, value.sign3);
  return <div className={styles.survey}>
    <div className={styles.heading}>
      <span>Тип происшествия</span>
      {onRemove && <button type="button" onClick={onRemove}>Удалить</button>}
    </div>
    <input required list={listId} value={value.type} placeholder="Начните вводить название"
      onChange={(event) => onChange({ type: event.target.value, sign2: '', sign3: '' })} />
    <datalist id={listId}>{types.map((type) => <option key={type} value={type} />)}</datalist>
    {second.length > 0 && <label>Признак 2
      <select required value={value.sign2} onChange={(event) => onChange({ ...value, sign2: event.target.value, sign3: '' })}>
        <option value=""></option>
        {second.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>}
    {third.length > 0 && <label>Признак 3
      <select required value={value.sign3} onChange={(event) => onChange({ ...value, sign3: event.target.value })}>
        <option value=""></option>
        {third.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>}
    {match && <div className={styles.result}>Код {match.code} · {match.result}</div>}
  </div>;
}
