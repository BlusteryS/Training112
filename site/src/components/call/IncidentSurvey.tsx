import { incidentOptions, matchingCard, type ClassifierCard } from '../../pages/incidentClassifier';
import { IncidentQuestions } from './IncidentQuestions';
import styles from './IncidentSurvey.module.css';

export type SurveySelection = { type: string; sign2: string; sign3: string; code: string };

export function IncidentSurvey({ cards, types, value, inputId, listId, showOptions = true,
  answers, onAnswerChange, onChange, onRemove }: {
  cards: ClassifierCard[];
  types: string[];
  value: SurveySelection;
  inputId: string;
  listId: string;
  showOptions?: boolean;
  answers?: Record<string, Record<string, string>>;
  onAnswerChange?: (code: string, key: string, value: string) => void;
  onChange: (value: SurveySelection) => void;
  onRemove?: () => void;
}) {
  const second = incidentOptions(cards, value.type);
  const third = incidentOptions(cards, value.type, value.sign2);
  const alternatives = cards.filter((card) => card.type === value.type
    && card.sign2 === value.sign2 && card.sign3 === value.sign3);
  const match = matchingCard(cards, value.type, value.sign2, value.sign3, value.code);
  return <div className={styles.survey}>
    <div className={styles.heading}>
      <span>Тип происшествия</span>
      {onRemove && <button type="button" onClick={onRemove}>Удалить</button>}
    </div>
    <input id={`${inputId}-input`} required list={listId} value={value.type}
      placeholder="Тип или название происшествия" onChange={(event) => {
        const text = event.target.value;
        const selected = cards.find((card) => `${card.result} · ${card.code}` === text);
        onChange(selected ? { type: selected.type, sign2: selected.sign2, sign3: selected.sign3,
          code: selected.code } : { type: text, sign2: '', sign3: '', code: '' });
      }} />
    {showOptions && <datalist id={listId}>
      {types.map((type) => <option key={type} value={type} />)}
      {cards.map((card) => <option key={card.code} value={`${card.result} · ${card.code}`} />)}
    </datalist>}
    {second.length > 0 && <label>Признак 2
      <select id={`${inputId}-sign2`} required value={value.sign2}
        onChange={(event) => onChange({ ...value, sign2: event.target.value, sign3: '', code: '' })}>
        <option value=""></option>
        {second.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>}
    {third.length > 0 && <label>Признак 3
      <select id={`${inputId}-sign3`} required value={value.sign3}
        onChange={(event) => onChange({ ...value, sign3: event.target.value, code: '' })}>
        <option value=""></option>
        {third.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>}
    {alternatives.length > 1 && <label>Уточните вариант
      <select required value={value.code} onChange={(event) => onChange({ ...value, code: event.target.value })}>
        <option value=""></option>
        {alternatives.map((option) => <option key={option.code} value={option.code}>
          {option.result} · {option.code}
        </option>)}
      </select>
    </label>}
    {match && <div className={styles.result}>Код {match.code} · {match.result}</div>}
    {match && onAnswerChange && <IncidentQuestions card={match} answers={answers?.[match.code] ?? {}}
      onChange={(key, answer) => onAnswerChange(match.code, key, answer)} />}
  </div>;
}
