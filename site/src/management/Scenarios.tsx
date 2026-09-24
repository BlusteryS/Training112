import { useEffect, useState } from 'react';
import { api } from '../api';
import { ScenarioEditor, exportScenario } from './ScenarioEditor';
import { incidentSources } from '../incidentSources';
import { incidentTypes } from '../pages/callIncidentTypes';
import { difficultyNames, scenarioNames, type Scenario, type ScenarioDocument } from './types';
import { PanelCard, PanelSubtitle, PanelTitle } from './Panel';

type SavedScenario = Scenario & { document: ScenarioDocument };
type Editor = { document: ScenarioDocument; scenarioId?: string };

export function Scenarios() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenario, setScenario] = useState('');
  const [detail, setDetail] = useState<SavedScenario | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [incident, setIncident] = useState(incidentTypes[0]?.name ?? '');
  const [location, setLocation] = useState('Москва, учебная улица, дом 10');
  const [difficulty, setDifficulty] = useState('basic');
  const [seconds, setSeconds] = useState('30');
  const [origin, setOrigin] = useState('Служба 112');
  const [caller, setCaller] = useState('Алексей');
  useEffect(() => {
    let cancelled = false;
    void api<Scenario[]>('training/scenarios').then((rows) => { if (!cancelled) setScenarios(rows); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [reload]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setDetail(null);
    async function read() {
      try {
        const row = await api<SavedScenario>(`training/scenarios/${scenario}`);
        if (cancelled) return;
        setDetail(row);
        if (row.status === 'preparing') timer = setTimeout(() => void read(), 3000);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Не удалось загрузить сценарий.'); }
    }
    if (scenario) void read();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [scenario, reload]);
  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await work(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось выполнить действие.'); }
    finally { setBusy(false); }
  }
  return <div>
    <PanelTitle>Сценарии звонков</PanelTitle>
    <div>Сценарий задаёт происшествие и то, что знает виртуальный заявитель. Создайте его, проверьте сведения и утвердите перед назначением занятия.</div>
    {!editor && <>
      <div><button disabled={busy} onClick={() => void act(async () => {
        const document = await api<ScenarioDocument>('training/example');
        setEditor({ document: { ...document, title: '', difficulty: 'basic', instructions: 'Примите учебный вызов. Уточните место происшествия, обстоятельства и сведения о пострадавших.' } });
      })}>Создать сценарий</button></div>
      <form onSubmit={(event) => { event.preventDefault(); void act(async () => {
        const created = await api<{ scenario_id: string }>('training/scenarios/reference', {
          incident, location, difficulty, seconds: Number(seconds), origin, caller_name: caller,
        });
        setScenario(created.scenario_id); setReload((n) => n + 1);
        setMessage('Эталон сформирован. Идёт проверка диалога и запись голоса. После статуса «Готов к утверждению» подтвердите сценарий.');
      }); }}>
        <fieldset disabled={busy}><legend>Сформировать эталон по параметрам занятия</legend>
          <div><label>Тип происшествия <select value={incident} onChange={(event) => setIncident(event.target.value)}>
            {incidentTypes.map((type) => <option key={type.name} value={type.name}>{type.name}</option>)}
          </select></label></div>
          <div><label>Место <input required maxLength={1000} value={location} onChange={(event) => setLocation(event.target.value)} /></label></div>
          <div><label>Сложность <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
            {Object.entries(difficultyNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label></div>
          <div><label>Норматив принятия карточки, секунд <input required inputMode="numeric" value={seconds} onChange={(event) => setSeconds(event.target.value.replace(/\D/g, '').slice(0, 5))} /></label></div>
          <div><label>Источник <select value={origin} onChange={(event) => setOrigin(event.target.value)}>
            {incidentSources.map((source) => <option key={source} value={source}>{source}</option>)}
          </select></label></div>
          <div><label>Имя заявителя <input required maxLength={200} value={caller} onChange={(event) => setCaller(event.target.value)} /></label></div>
          <button>Сформировать эталон</button>
        </fieldset>
      </form>
    </>}
    {editor ? <ScenarioEditor initial={editor.document} editing={!!editor.scenarioId} busy={busy}
      onCancel={() => setEditor(null)} onSave={async (document) => {
        setBusy(true); setError('');
        try {
          const created = await api<{ scenario_id: string }>(editor.scenarioId
            ? `training/scenarios/${editor.scenarioId}` : 'training/scenarios', document);
          setScenario(created.scenario_id); setEditor(null); setReload((n) => n + 1);
          setMessage('Сценарий сохранён. Проверка диалога и запись голоса выполняются автоматически.');
        } finally { setBusy(false); }
      }} /> : <>
      <details><summary>Перенос сценариев: импорт и экспорт JSON</summary>
        <div>Скачайте сценарий, чтобы сохранить копию или перенести её в другой учебный комплекс. Импорт создаёт отдельный сценарий и заново проверяет его.</div>
        <label>Загрузить сценарий из файла <input disabled={busy} type="file" accept="application/json,.json" onChange={(e) => {
          const file = e.target.files?.[0]; e.target.value = '';
          if (!file) return;
          void act(async () => {
            if (file.size > 262144) throw new Error('Размер сценария превышает 256 КиБ.');
            let document: unknown;
            try { document = JSON.parse(await file.text()); } catch { throw new Error('Файл не содержит корректный JSON. Выберите ранее экспортированный сценарий.'); }
            const created = await api<{ scenario_id: string }>('training/scenarios', document);
            setScenario(created.scenario_id); setReload((n) => n + 1);
            setMessage('Сценарий импортирован. Проверка и запись голоса начались автоматически.');
          });
        }} /></label>
      </details>
      {!scenarios.length && <div>Сценариев пока нет. Нажмите «Создать сценарий»: откроется форма с примером, который можно изменить.</div>}
      <div><label>Сценарий <select disabled={busy} value={scenario} onChange={(e) => setScenario(e.target.value)}>
        <option value="">Выберите сценарий</option>{scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
      </select></label>{' '}{scenario && <button disabled={busy} onClick={() => setReload((n) => n + 1)}>Обновить состояние</button>}</div>
      {detail && <PanelCard>
        <PanelSubtitle>{detail.document.title}</PanelSubtitle>
        <div role="status">{scenarioNames[detail.status] ?? detail.status}</div>
        {detail.status === 'preparing' && <div>Сервер проверяет, понимает ли заявитель вопросы, и записывает его реплики. Дождитесь статуса «Готов к утверждению»; состояние обновляется автоматически.</div>}
        {detail.status === 'failed' && <div role="alert">Проверка диалога или запись голоса не удалась. Проверьте сведения и сохраните сценарий повторно. Если ошибка повторяется, администратору нужно проверить речевые модели и журнал обработчика сценариев.</div>}
        <div>{Object.entries(detail.document.facts).map(([key, value]) => <div key={key}>
          <div>{{ caller_name: 'Заявитель', address: 'Место', incident: 'Происшествие', victims: 'Пострадавшие' }[key] ?? key}</div><div>{value}</div>
        </div>)}</div>
        <div><button disabled={busy} onClick={() => setEditor({ document: detail.document, scenarioId: scenario })}>Редактировать сценарий</button>{' '}
          <button disabled={busy} onClick={() => exportScenario(detail.document)}>Скачать сценарий (JSON)</button></div>
        {detail.status === 'prepared' && <div><button disabled={busy} onClick={() => void act(async () => {
          await api(`training/scenarios/${detail.id}/approve`, {});
          setDetail({ ...detail, status: 'approved' });
          setMessage('Сценарий утверждён. Откройте «Занятия», выберите участников и назначьте звонок.');
        })}>Утвердить для занятий</button></div>}
        {detail.status === 'approved' && <div>Сценарий можно назначить для занятия.</div>}
        <details><summary>Убрать неактуальный сценарий</summary>
          <div>Он исчезнет из списка для новых занятий. Уже назначенные занятия и история сохранятся.</div>
          <button disabled={busy} onClick={() => void act(async () => {
            await api(`training/scenarios/${scenario}/archive`, {});
            setScenario(''); setReload((n) => n + 1); setMessage('Сценарий убран из списка.');
          })}>Убрать из списка сценариев</button>
          <div>Удаление возможно, пока сценарий не назначен ни на одно занятие.</div>
          <button disabled={busy} onClick={() => void act(async () => {
            await api(`training/scenarios/${scenario}/delete`, {});
            setScenario(''); setReload((n) => n + 1); setMessage('Сценарий удалён.');
          })}>Удалить сценарий</button>
        </details>
      </PanelCard>}
    </>}
    {error && <div role="alert">{error}</div>}{message && <div role="status">{message}</div>}
  </div>;
}
