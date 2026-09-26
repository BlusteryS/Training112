import { useEffect, useState } from 'react';
import { SelectField } from '../ui/SelectField';
import { InputField } from '../ui/InputField';
import { TextareaField } from '../ui/TextareaField';
import styles from './DdsStatusEditor.module.css';

const labels: Record<string, string> = {
  accepted: 'Принята', rejected: 'Не принята', dispatched: 'Начало реагирования',
  arrived: 'Прибытие', working: 'Проведение работ', completed: 'Работы завершены',
  refused: 'Отказ от выполнения работ',
};

const options: Record<string, string[]> = {
  received: ['accepted', 'rejected'],
  rejected: ['accepted'],
  accepted: ['dispatched', 'arrived', 'working', 'completed', 'refused'],
  dispatched: ['arrived', 'working', 'completed', 'refused'],
  arrived: ['working', 'completed', 'refused'],
  working: ['completed', 'refused'],
};

export function DdsStatusEditor({ status, crew, pendingReport, busy, onMove }: {
  status: string;
  crew: string | null;
  pendingReport: string;
  busy: boolean;
  onMove: (status: string, comment: string) => Promise<boolean>;
}) {
  const available = options[status] ?? [];
  const [next, setNext] = useState(available[0] ?? '');
  const [comment, setComment] = useState('');
  useEffect(() => setNext((current) => available.includes(current) ? current : available[0] ?? ''), [status]);
  if (available.length === 0) return null;
  const needsComment = ['rejected', 'refused', 'completed'].includes(next);
  const needsReport = !['accepted', 'rejected'].includes(next);
  const ready = !!next && !busy && (!needsComment || !!comment.trim())
    && (!needsReport || pendingReport === next);
  return <div className={styles.editor}>
    <div className={styles.title}>Статус реагирования вашей службы</div>
    <div className={styles.controls}>
      <SelectField label="Новый статус" value={next} onChange={(event) => setNext(event.target.value)}>
        {available.map((item) => <option key={item} value={item}>{labels[item]}</option>)}
      </SelectField>
      <InputField label="Бригада" value={crew ?? 'Не назначена'} readOnly />
      <TextareaField label="Комментарий" value={comment} maxLength={4000}
        onChange={(event) => setComment(event.target.value)} />
      <button type="button" disabled={!ready} onClick={() => void onMove(next, comment.trim()).then((saved) => {
        if (saved) setComment('');
      })}>Сохранить статус</button>
    </div>
    {needsReport && pendingReport !== next && <div className={styles.hint}>
      Для этого статуса сначала нужен соответствующий доклад старшего бригады.
    </div>}
    {needsComment && !comment.trim() && <div className={styles.hint}>Укажите причину или результат в комментарии.</div>}
  </div>;
}
