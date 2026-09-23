import { useEffect, useState } from 'react';
import { api } from '../api';
import { ScenarioEditor, exportScenario } from './ScenarioEditor';
import { scenarioNames, type Scenario, type ScenarioDocument } from './types';

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
  return <section aria-labelledby="scenarios-title">
    <h2 id="scenarios-title">Сценарии звонков</h2>
    <p>Сценарий задаёт происшествие и то, что знает виртуальный заявитель. Создайте его, проверьте сведения и утвердите перед назначением занятия.</p>
    {!editor && <p><button disabled={busy} onClick={() => void act(async () => {
      const document = await api<ScenarioDocument>('training/example');
      setEditor({ document: { ...document, title: '', difficulty: 'basic', instructions: 'Примите учебный вызов. Уточните место происшествия, обстоятельства и сведения о пострадавших.' } });
    })}>Создать сценарий</button></p>}
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
        <p>Скачайте сценарий, чтобы сохранить копию или перенести её в другой учебный комплекс. Импорт создаёт отдельный сценарий и заново проверяет его.</p>
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
      {!scenarios.length && <p>Сценариев пока нет. Нажмите «Создать сценарий»: откроется форма с примером, который можно изменить.</p>}
      <p><label>Сценарий <select disabled={busy} value={scenario} onChange={(e) => setScenario(e.target.value)}>
        <option value="">Выберите сценарий</option>{scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
      </select></label>{' '}{scenario && <button disabled={busy} onClick={() => setReload((n) => n + 1)}>Обновить состояние</button>}</p>
      {detail && <article>
        <h3>{detail.document.title}</h3>
        <p role="status">{scenarioNames[detail.status] ?? detail.status}</p>
        {detail.status === 'preparing' && <p>Сервер проверяет, понимает ли заявитель вопросы, и записывает его реплики. Дождитесь статуса «Готов к утверждению»; состояние обновляется автоматически.</p>}
        {detail.status === 'failed' && <p role="alert">Проверка диалога или запись голоса не удалась. Проверьте сведения и сохраните сценарий повторно. Если ошибка повторяется, администратору нужно проверить речевые модели и журнал обработчика сценариев.</p>}
        <dl>{Object.entries(detail.document.facts).map(([key, value]) => <div key={key}>
          <dt>{{ caller_name: 'Заявитель', address: 'Место', incident: 'Происшествие', victims: 'Пострадавшие' }[key] ?? key}</dt><dd>{value}</dd>
        </div>)}</dl>
        <p><button disabled={busy} onClick={() => setEditor({ document: detail.document, scenarioId: scenario })}>Редактировать сценарий</button>{' '}
          <button disabled={busy} onClick={() => exportScenario(detail.document)}>Скачать сценарий (JSON)</button></p>
        {detail.status === 'prepared' && <p><button disabled={busy} onClick={() => void act(async () => {
          await api(`training/scenarios/${detail.id}/approve`, {});
          setDetail({ ...detail, status: 'approved' });
          setMessage('Сценарий утверждён. Откройте «Занятия», выберите участников и назначьте звонок.');
        })}>Утвердить для занятий</button></p>}
        {detail.status === 'approved' && <p>Сценарий можно назначить для занятия.</p>}
        <details><summary>Убрать неактуальный сценарий</summary>
          <p>Он исчезнет из списка для новых занятий. Уже назначенные занятия и история сохранятся.</p>
          <button disabled={busy} onClick={() => void act(async () => {
            await api(`training/scenarios/${scenario}/archive`, {});
            setScenario(''); setReload((n) => n + 1); setMessage('Сценарий убран из списка.');
          })}>Убрать из списка сценариев</button>
        </details>
      </article>}
    </>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
