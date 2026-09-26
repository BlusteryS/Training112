import { useState } from 'react';
import { ModalForm } from '../components/ModalForm';
import { FormCard, formGrid } from './FormCard';
import { InputField } from '../components/ui/InputField';
import { SelectField } from '../components/ui/SelectField';
import { TextareaField } from '../components/ui/TextareaField';
import { incidentSources } from '../incidentSources';
import { difficultyNames, type ScenarioDocument } from './types';

const factNames: Record<string, string> = {
  caller_name: 'Имя заявителя', address: 'Место происшествия', incident: 'Что произошло',
  victims: 'Сведения о пострадавших', phone: 'Телефон заявителя',
  victim_count: 'Число пострадавших', age: 'Возраст пострадавшего',
  consciousness: 'Сознание пострадавшего', breathing: 'Дыхание пострадавшего',
  danger: 'Опасность для заявителя', fire: 'Место горения', weapon: 'Оружие',
  description_details: 'Приметы и дополнительные подробности', vehicle: 'Транспорт',
};

export function exportScenario(document: ScenarioDocument) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }));
  const link = window.document.createElement('a');
  link.href = url;
  link.download = `${document.title.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'scenario'}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ScenarioEditor({ initial, editing, busy, onSave, onCancel }: {
  initial: ScenarioDocument; editing: boolean; busy: boolean;
  onSave: (document: ScenarioDocument) => Promise<void>; onCancel: () => void;
}) {
  const [document, setDocument] = useState(() => ({ ...structuredClone(initial), difficulty: initial.difficulty ?? 'basic' }));
  const [error, setError] = useState('');
  function fact(key: string, value: string) {
    setDocument((previous) => ({ ...previous, facts: { ...previous.facts, [key]: value },
      rubric: previous.rubric.map((rule) => rule.field === key && rule.expected === previous.facts[key]
        ? { ...rule, expected: value } : rule),
    }));
  }
  return <ModalForm label={editing ? 'Сценарий' : 'Новый сценарий'} onClose={onCancel}>
<FormCard title={editing ? 'Сценарий' : 'Новый сценарий'} submitLabel="Сохранить" busy={busy} error={error} onClose={onCancel}
    onSubmit={() => { setError(''); void onSave(document).catch((cause: Error) => setError(cause.message)); }}>
    <div className={formGrid}>
      <InputField label="Название" required maxLength={200} value={document.title} onChange={(event) => setDocument({ ...document, title: event.target.value })} />
      <SelectField label="Источник" required value={document.origin ?? ''} onChange={(event) => setDocument({ ...document, origin: event.target.value })}>
        <option value=""></option>
        {incidentSources.map((source) => <option key={source} value={source}>{source}</option>)}
      </SelectField>
      <SelectField label="Сложность" value={document.difficulty ?? 'basic'} onChange={(event) => setDocument({ ...document, difficulty: event.target.value })}>
        {Object.entries(difficultyNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </SelectField>
      <TextareaField label="Инструкция" maxLength={2000} value={document.instructions ?? ''} onChange={(event) => setDocument({ ...document, instructions: event.target.value })} />
      <InputField label="Минимальная оценка для зачёта, 0–100" type="number" min={0} max={100}
        value={document.pass_score ?? 70} onChange={(event) => setDocument({ ...document, pass_score: Number(event.target.value) })} />
      <InputField label="Допустимое число ошибок" type="number" min={0} max={100}
        value={document.max_errors ?? 2} onChange={(event) => setDocument({ ...document, max_errors: Number(event.target.value) })} />
      {Object.entries(document.facts).map(([key, value]) => <TextareaField key={key} label={factNames[key] ?? key}
        required maxLength={1000} value={value} onChange={(event) => fact(key, event.target.value)} />)}
      {document.rubric.map((rule, index) => <div key={rule.id}>
        <div>{rule.description}</div>
        {rule.expected !== undefined && <TextareaField label="Требуемый ответ" required maxLength={2000} value={rule.expected} onChange={(event) => setDocument({
          ...document, rubric: document.rubric.map((item, itemIndex) => itemIndex === index ? { ...item, expected: event.target.value } : item),
        })} />}
        {rule.kind === 'deadline' && <InputField label="Норматив заполнения карточки оператора 112, секунд" required type="number" min={1} max={86400} value={rule.seconds ?? 30} onChange={(event) => {
          const seconds = Number(event.target.value);
          setDocument({ ...document, rubric: document.rubric.map((item, itemIndex) => itemIndex === index ? {
            ...item, seconds, description: `Карточка сохранена в течение ${seconds} секунд.`,
          } : item) });
        }} />}
        <InputField label="Вес критерия, баллов" type="number" min={1} max={100} value={rule.weight}
          onChange={(event) => setDocument({ ...document, rubric: document.rubric.map((item, itemIndex) => itemIndex === index
            ? { ...item, weight: Number(event.target.value) } : item) })} />
        <label><input type="checkbox" checked={rule.mandatory ?? false} onChange={(event) => setDocument({
          ...document, rubric: document.rubric.map((item, itemIndex) => itemIndex === index
            ? { ...item, mandatory: event.target.checked } : item),
        })} />Обязательный критерий для зачёта</label>
      </div>)}
    </div>
  </FormCard>
</ModalForm>;
}
