import { useEffect, useState } from 'react';
import { SelectField } from '../ui/SelectField';
import { InputField } from '../ui/InputField';
import { TextareaField } from '../ui/TextareaField';
import { ddsStatusNames, ddsStatusOptions } from './statuses';
import styles from './DdsStatusEditor.module.css';

export function DdsStatusEditor({ status, crew, pendingReport, busy, onMove }: {
  status: string;
  crew: string | null;
  pendingReport: string;
  busy: boolean;
  onMove: (status: string, comment: string) => Promise<boolean>;
}) {
  const available = ddsStatusOptions[status] ?? [];
  const [next, setNext] = useState('');
  const [comment, setComment] = useState('');
  useEffect(() => setNext(''), [status]);
  if (available.length === 0) return null;
  const needsReport = !!next && !['accepted', 'rejected'].includes(next);
  const ready = !!next && !busy && !!comment.trim()
    && (!needsReport || pendingReport === next);
  return <div className={styles.editor}>
    <div className={styles.title}>Статус реагирования вашей службы
      <span>Сейчас: {ddsStatusNames[status] ?? status}</span>
    </div>
    <div className={styles.controls}>
      <SelectField label="Новый статус" value={next} onChange={(event) => setNext(event.target.value)}>
        <option value="" disabled>Выберите статус</option>
        {available.map((item) => <option key={item} value={item}>{ddsStatusNames[item]}</option>)}
      </SelectField>
      <InputField label="Бригада" value={crew ?? 'Не назначена'} readOnly />
      <TextareaField label="Комментарий" value={comment} maxLength={4000}
        onChange={(event) => setComment(event.target.value)} />
      <button type="button" disabled={!ready} onClick={() => void onMove(next, comment.trim()).then((saved) => {
        if (saved) setComment('');
      })}>Сохранить</button>
    </div>
    {needsReport && pendingReport !== next && <div className={styles.hint}>
      Для этого статуса сначала нужен соответствующий доклад старшего бригады.
    </div>}
    {!!next && !comment.trim() && <div className={styles.hint}>Укажите обстоятельства смены статуса в комментарии.</div>}
  </div>;
}
