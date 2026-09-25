import { useEffect, useState } from 'react';
import { api } from '../api';
import { ModalForm } from '../components/ModalForm';
import { FormCard, formGrid } from './FormCard';
import { InputField } from '../components/ui/InputField';
import { SelectField } from '../components/ui/SelectField';
import { incidentSources } from '../incidentSources';
import { incidentTypes } from '../pages/callIncidentTypes';
import { ScenarioEditor, exportScenario } from './ScenarioEditor';
import { difficultyNames, scenarioNames, type Scenario, type ScenarioDocument } from './types';
import { Desk, DeskEmpty, DeskRow, DeskTable, deskActions, deskError } from './Desk';

type SavedScenario = Scenario & { document: ScenarioDocument };
type Editor = { document: ScenarioDocument; scenarioId?: string };
const columns = 'minmax(200px, 1.6fr) 180px minmax(280px, auto)';

export function Scenarios() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [reference, setReference] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void api<Scenario[]>('training/scenarios').then((rows) => { if (!cancelled) setScenarios(rows); })
      .catch((cause: Error) => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, [reload]);
  useEffect(() => {
    if (!scenarios.some((item) => item.status === 'preparing')) return undefined;
    const timer = setTimeout(() => setReload((value) => value + 1), 3000);
    return () => clearTimeout(timer);
  }, [scenarios]);

  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await work(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось выполнить действие.'); }
    finally { setBusy(false); }
  }

  return <Desk title="Сценарии" actions={<>
    <button type="button" disabled={busy} onClick={() => void act(async () => {
      const document = await api<ScenarioDocument>('training/example');
      setEditor({ document: { ...document, title: '', difficulty: 'basic', instructions: 'Примите учебный вызов. Уточните место происшествия, обстоятельства и сведения о пострадавших.' } });
    })}>Создать</button>
    <button type="button" disabled={busy} onClick={() => setReference(true)}>Эталон</button>
    <button type="button" disabled={busy} onClick={() => setImporting(true)}>Импорт</button>
  </>}>
    {scenarios.length === 0 ? <DeskEmpty>Сценариев нет</DeskEmpty> : <DeskTable columns={columns} head={<><span>Название</span><span>Статус</span><span /></>}>
      {scenarios.map((item) => <DeskRow key={item.id} columns={columns}>
        <span>{item.title}</span>
        <span>{scenarioNames[item.status] ?? item.status}</span>
        <span className={deskActions}>
          {item.status === 'prepared' && <button type="button" disabled={busy} onClick={() => void act(async () => {
            await api(`training/scenarios/${item.id}/approve`, {});
            setReload((value) => value + 1);
          })}>Утвердить</button>}
          <button type="button" disabled={busy} onClick={() => void act(async () => {
            const saved = await api<SavedScenario>(`training/scenarios/${item.id}`);
            setEditor({ document: saved.document, scenarioId: item.id });
          })}>Изменить</button>
          <button type="button" disabled={busy} onClick={() => void act(async () => exportScenario((await api<SavedScenario>(`training/scenarios/${item.id}`)).document))}>JSON</button>
          <button type="button" disabled={busy} onClick={() => void act(async () => {
            await api(`training/scenarios/${item.id}/archive`, {});
            setReload((value) => value + 1);
          })}>Скрыть</button>
          <button type="button" disabled={busy} onClick={() => void act(async () => {
            await api(`training/scenarios/${item.id}/delete`, {});
            setReload((value) => value + 1);
          })}>Удалить</button>
        </span>
      </DeskRow>)}
    </DeskTable>}
    {error && <div className={deskError} role="alert">{error}</div>}
    {editor && <ScenarioEditor initial={editor.document} editing={!!editor.scenarioId} busy={busy} onCancel={() => setEditor(null)}
      onSave={async (document) => {
        setBusy(true); setError('');
        try {
          await api(editor.scenarioId ? `training/scenarios/${editor.scenarioId}` : 'training/scenarios', document);
          setEditor(null);
          setReload((value) => value + 1);
        } finally { setBusy(false); }
      }} />}
    {reference && <ReferenceDialog busy={busy} error={error} onClose={() => setReference(false)} onSubmit={(body) => {
      void act(async () => {
        await api('training/scenarios/reference', body);
        setReference(false);
        setReload((value) => value + 1);
      });
    }} />}
    {importing && <ImportDialog busy={busy} error={error} onClose={() => setImporting(false)} onSubmit={(document) => {
      void act(async () => {
        await api('training/scenarios', document);
        setImporting(false);
        setReload((value) => value + 1);
      });
    }} />}
  </Desk>;
}

function ReferenceDialog({ busy, error, onClose, onSubmit }: {
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (body: Record<string, string | number>) => void;
}) {
  const [incident, setIncident] = useState(incidentTypes[0]?.name ?? '');
  const [location, setLocation] = useState('Москва, учебная улица, дом 10');
  const [difficulty, setDifficulty] = useState('basic');
  const [seconds, setSeconds] = useState('30');
  const [origin, setOrigin] = useState('Служба 112');
  const [caller, setCaller] = useState('Алексей');
  return <ModalForm label="Эталон">
<FormCard title="Эталон" submitLabel="Сформировать" busy={busy} error={error} onClose={onClose} onSubmit={() => onSubmit({
    incident, location, difficulty, seconds: Number(seconds), origin, caller_name: caller,
  })}>
    <div className={formGrid}>
      <SelectField label="Тип происшествия" value={incident} onChange={(event) => setIncident(event.target.value)}>
        {incidentTypes.map((type) => <option key={type.name} value={type.name}>{type.name}</option>)}
      </SelectField>
      <InputField label="Место" maxLength={1000} value={location} onChange={(event) => setLocation(event.target.value)} />
      <SelectField label="Сложность" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
        {Object.entries(difficultyNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </SelectField>
      <InputField label="Сохранение карточки, секунд" inputMode="numeric" value={seconds} onChange={(event) => setSeconds(event.target.value.replace(/\D/g, '').slice(0, 5))} />
      <SelectField label="Источник" value={origin} onChange={(event) => setOrigin(event.target.value)}>
        {incidentSources.map((source) => <option key={source} value={source}>{source}</option>)}
      </SelectField>
      <InputField label="Заявитель" maxLength={200} value={caller} onChange={(event) => setCaller(event.target.value)} />
    </div>
  </FormCard>
</ModalForm>;
}

function ImportDialog({ busy, error: externalError, onClose, onSubmit }: {
  busy: boolean; error: string; onClose: () => void; onSubmit: (document: unknown) => void;
}) {
  const [error, setError] = useState('');
  return <ModalForm label="Импорт сценария">
<FormCard title="Импорт сценария" error={error || externalError} busy={busy} onClose={onClose}>
    <InputField label="JSON" type="file" accept="application/json,.json" onChange={(event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      void file.text().then((text) => {
        if (file.size > 262144) throw new Error('Размер сценария превышает 256 КиБ.');
        onSubmit(JSON.parse(text));
      }).catch(() => setError('Файл не содержит корректный JSON.'));
    }} />
  </FormCard>
</ModalForm>;
}
