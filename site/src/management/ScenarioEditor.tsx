import { useState } from 'react';
import { ModalForm } from '../components/ModalForm';
import { FormCard, formGrid } from './FormCard';
import { InputField } from '../components/ui/InputField';
import { SelectField } from '../components/ui/SelectField';
import { TextareaField } from '../components/ui/TextareaField';
import { incidentSources, moscowOkrugs } from '../incidentSources';
import { ScenarioCriterion } from './ScenarioCriterion';
import { difficultyNames, type ScenarioDocument } from './types';
import styles from './ScenarioEditor.module.css';

const factNames: Record<string, string> = {
  caller_name: 'Имя заявителя', address: 'Место происшествия', incident: 'Что произошло',
  victims: 'Сведения о пострадавших', phone: 'Телефон заявителя',
  victim_count: 'Число пострадавших', age: 'Возраст пострадавшего',
  consciousness: 'Сознание пострадавшего', breathing: 'Дыхание пострадавшего',
  danger: 'Опасность для заявителя', fire: 'Место горения', weapon: 'Оружие',
  description_details: 'Приметы и дополнительные подробности', vehicle: 'Транспорт',
  incident_code: 'Тип происшествия', description: 'Описание происшествия',
  classifier_code: 'Код сценария реагирования', incident_sign_2: 'Признак 2',
  incident_sign_3: 'Признак 3',
  district: 'Район происшествия', okrug: 'Округ происшествия',
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
    setDocument((previous) => {
      const facts = { ...previous.facts };
      if ((key === 'district' || key === 'okrug') && !value.trim()) delete facts[key];
      else facts[key] = value;
      return { ...previous, facts };
    });
  }
  function updateCriterion(id: string, changes: Partial<ScenarioDocument['rubric'][number]>) {
    setDocument((previous) => ({ ...previous,
      rubric: previous.rubric.map((rule) => rule.id === id ? { ...rule, ...changes } : rule),
    }));
  }
  function save() {
    if (!document.title.trim() || !document.origin) {
      setError('Укажите название и источник обращения.');
      return;
    }
    const missing = Object.entries(document.facts).find(([key, value]) =>
      key !== 'district' && key !== 'okrug' && !value.trim());
    if (missing) {
      setError(`Заполните поле «${factNames[missing[0]] ?? missing[0]}».`);
      return;
    }
    if (document.rubric.some((rule) => !Number.isInteger(rule.weight) || rule.weight < 1 || rule.weight > 100
        || rule.kind === 'deadline' && (!Number.isInteger(rule.seconds) || (rule.seconds ?? 0) < 1
          || (rule.seconds ?? 0) > 86400))) {
      setError('Проверьте баллы критериев и норматив времени.');
      return;
    }
    if (!Number.isInteger(document.pass_score ?? 70) || (document.pass_score ?? 70) < 0
      || (document.pass_score ?? 70) > 100 || !Number.isInteger(document.max_errors ?? 2)
      || (document.max_errors ?? 2) < 0 || (document.max_errors ?? 2) > 100) {
      setError('Проверьте минимальную оценку и число ошибок.');
      return;
    }
    setError('');
    const facts = { ...document.facts };
    if (!facts.district?.trim()) delete facts.district;
    if (!facts.okrug?.trim()) delete facts.okrug;
    void onSave({ ...document, facts }).catch((cause: Error) => setError(cause.message));
  }
  return <ModalForm label={editing ? 'Сценарий' : 'Новый сценарий'} onClose={onCancel}>
<FormCard title={editing ? 'Сценарий' : 'Новый сценарий'} submitLabel="Сохранить" busy={busy} error={error} onClose={onCancel}
    onSubmit={save}>
  <div className={styles.sections}>
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Общие сведения</div>
      <div className={formGrid}>
        <InputField label="Название" required maxLength={200} value={document.title} onChange={(event) => setDocument({ ...document, title: event.target.value })} />
        {document.classifier_code && <InputField label="Код сценария реагирования" value={document.classifier_code} readOnly />}
        <SelectField label="Источник" required value={document.origin ?? ''} onChange={(event) => setDocument({ ...document, origin: event.target.value })}>
          <option value=""></option>
          {incidentSources.map((source) => <option key={source} value={source}>{source}</option>)}
        </SelectField>
        <SelectField label="Сложность" value={document.difficulty ?? 'basic'} onChange={(event) => setDocument({ ...document, difficulty: event.target.value })}>
          {Object.entries(difficultyNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </SelectField>
        <TextareaField label="Инструкция" maxLength={2000} value={document.instructions ?? ''} onChange={(event) => setDocument({ ...document, instructions: event.target.value })} />
      </div>
    </div>
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Ответы заявителя</div>
      <div className={formGrid}>
        {Object.entries(document.facts).filter(([key]) => key !== 'district' && key !== 'okrug')
          .map(([key, value]) => <TextareaField key={key} label={factNames[key] ?? key}
          required maxLength={1000} value={value} onChange={(event) => fact(key, event.target.value)} />)}
        <InputField label="Район происшествия" maxLength={200} value={document.facts.district ?? ''}
          onChange={(event) => fact('district', event.target.value)} />
        <SelectField label="Округ происшествия" value={document.facts.okrug ?? ''}
          onChange={(event) => fact('okrug', event.target.value)}>
          <option value="">Не указан</option>
          {moscowOkrugs.map((okrug) => <option key={okrug} value={okrug}>{okrug}</option>)}
        </SelectField>
      </div>
    </div>
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Оценивание</div>
      <div className={formGrid}>
        <InputField label="Минимальная оценка для зачёта, 0–100" type="number" min={0} max={100}
          value={document.pass_score ?? 70} onChange={(event) => setDocument({ ...document, pass_score: Number(event.target.value) })} />
        <InputField label="Допустимое число ошибок" type="number" min={0} max={100}
          value={document.max_errors ?? 2} onChange={(event) => setDocument({ ...document, max_errors: Number(event.target.value) })} />
      </div>
    </div>
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Критерии проверки карточки</div>
      <div className={styles.criteria}>
        {document.rubric.map((rule, index) => <ScenarioCriterion key={rule.id}
          rule={rule} number={index + 1} fieldName={rule.field ? factNames[rule.field] ?? rule.field : undefined}
          onChange={(changes) => updateCriterion(rule.id, changes)} />)}
      </div>
    </div>
  </div>
  </FormCard>
</ModalForm>;
}
