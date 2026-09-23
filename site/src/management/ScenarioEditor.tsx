import { useState, type FormEvent } from 'react';
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
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try { await onSave(document); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить сценарий.'); }
  }
  return <form onSubmit={(event) => void submit(event)}>
    <h3>{editing ? 'Редактировать сценарий' : 'Новый сценарий'}</h3>
    <p>Опишите происшествие и ответы заявителя. Эти сведения видны только преподавателю: обучающийся узнает их в разговоре.</p>
    <fieldset disabled={busy}><legend>Условия задания</legend>
      <p><label>Название <input required maxLength={200} value={document.title} onChange={(e) => setDocument({ ...document, title: e.target.value })} /></label></p>
      <p><label>Уровень сложности <select value={document.difficulty ?? 'basic'} onChange={(e) => setDocument({ ...document, difficulty: e.target.value })}>
        {Object.entries(difficultyNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label></p>
      <p>Уровень помогает выбирать задания. Сложность разговора задаётся обстоятельствами и ответами заявителя ниже.</p>
      <p><label>Инструкция обучающемуся (без ответов на задание)<br /><textarea rows={3} maxLength={2000} value={document.instructions ?? ''} onChange={(e) => setDocument({ ...document, instructions: e.target.value })} /></label></p>
      {Object.entries(document.facts).map(([key, value]) => <p key={key}><label>{factNames[key] ?? key}<br />
        <textarea rows={2} required maxLength={1000} value={value} onChange={(e) => fact(key, e.target.value)} />
      </label></p>)}
    </fieldset>
    <details><summary>Критерии выполнения задания и время</summary>
      <p>Проверьте эталонные ответы при изменении происшествия. Временной норматив по умолчанию — 30 секунд; он не ограничивает длительность всего звонка.</p>
      <fieldset disabled={busy}><legend>Критерии сценария</legend>
        {document.rubric.map((rule, index) => <fieldset key={rule.id}><legend>{rule.description}</legend>
          {rule.expected !== undefined && <p><label>Эталонный ответ<br /><textarea required rows={2} maxLength={2000} value={rule.expected} onChange={(e) => setDocument({ ...document, rubric: document.rubric.map((r, i) => i === index ? { ...r, expected: e.target.value } : r) })} /></label></p>}
          {rule.kind === 'deadline' && <p><label>Время выполнения, секунд <input required type="number" min={1} max={86400} value={rule.seconds ?? 30} onChange={(e) => setDocument({ ...document, rubric: document.rubric.map((r, i) => i === index ? { ...r, seconds: Number(e.target.value) } : r) })} /></label></p>}
        </fieldset>)}
      </fieldset>
    </details>
    <p>После сохранения сервер проверит диалог и запишет голос заявителя. Затем просмотрите сценарий и утвердите его для занятий. Активный сценарий нельзя редактировать до завершения занятия.</p>
    {error && <p role="alert">{error}</p>}
    <p><button disabled={busy}>{busy ? 'Сохраняем…' : editing ? 'Сохранить изменения' : 'Сохранить сценарий'}</button>{' '}
      <button type="button" disabled={busy} onClick={() => exportScenario(document)}>Скачать JSON</button>{' '}
      <button type="button" disabled={busy} onClick={onCancel}>Отменить редактирование</button></p>
  </form>;
}
