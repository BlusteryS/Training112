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
  return <ModalForm label={editing ? 'Сценарий' : 'Новый сценарий'}>
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
      {Object.entries(document.facts).map(([key, value]) => <TextareaField key={key} label={factNames[key] ?? key}
        required maxLength={1000} value={value} onChange={(event) => fact(key, event.target.value)} />)}
      {document.rubric.map((rule, index) => rule.expected !== undefined
        ? <TextareaField key={rule.id} label={rule.description} required maxLength={2000} value={rule.expected} onChange={(event) => setDocument({
          ...document, rubric: document.rubric.map((item, itemIndex) => itemIndex === index ? { ...item, expected: event.target.value } : item),
        })} />
        : rule.kind === 'deadline' ? <InputField key={rule.id} label="Сохранение карточки, секунд" required type="number" min={1} max={86400} value={rule.seconds ?? 30} onChange={(event) => {
          const seconds = Number(event.target.value);
          setDocument({
            ...document, rubric: document.rubric.map((item, itemIndex) => itemIndex === index ? {
              ...item, seconds, description: `Карточка сохранена в течение ${seconds} секунд.`,
            } : item),
          });
        }} /> : null)}
    </div>
  </FormCard>
</ModalForm>;
}
