import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { InputField } from '../components/ui/InputField';
import { SelectField } from '../components/ui/SelectField';
import { Desk, DeskSection, deskError } from './Desk';
import styles from './Operations.module.css';

type Settings = {
  service_speech_enabled: number;
  service_worker_enabled: number;
  dds_phone_enabled: number;
  audit_retention_days: number;
  backup_interval_hours: number;
  backup_retention_count: number;
};

export function Operations() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void api<Settings>('admin/operations').then(setSettings).catch((cause: Error) => setError(cause.message));
  }, []);

  function save(event: FormEvent) {
    event.preventDefault();
    if (!settings || busy) return;
    setBusy(true);
    setSaved(false);
    setError('');
    void api('admin/operations', settings)
      .then(() => setSaved(true))
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setBusy(false));
  }

  function number(key: keyof Settings, value: string) {
    setSettings((current) => current && { ...current, [key]: Number(value) });
  }

  return <Desk>
    {settings && <form className={styles.form} onSubmit={save}>
      <DeskSection title="Сервисы">
        <div className={styles.fields}>
          <SelectField label="Учебные звонки оператора 112" value={settings.service_speech_enabled}
            onChange={(event) => number('service_speech_enabled', event.target.value)}>
            <option value={1}>Доступны</option><option value={0}>Отключены</option>
          </SelectField>
          <SelectField label="Подготовка сценариев и оценка" value={settings.service_worker_enabled}
            onChange={(event) => number('service_worker_enabled', event.target.value)}>
            <option value={1}>Работает</option><option value={0}>Приостановлена</option>
          </SelectField>
          <SelectField label="Телефон ДДС" value={settings.dds_phone_enabled}
            onChange={(event) => number('dds_phone_enabled', event.target.value)}>
            <option value={1}>Доступен</option><option value={0}>Отключён</option>
          </SelectField>
        </div>
      </DeskSection>
      <DeskSection title="Журналирование">
        <div className={styles.fields}>
          <InputField label="Хранить журнал действий, дней" type="number" min={186} max={3650} required
            value={settings.audit_retention_days} onChange={(event) => number('audit_retention_days', event.target.value)} />
        </div>
      </DeskSection>
      <DeskSection title="Автоматическое резервное копирование">
        <div className={styles.fields}>
          <InputField label="Интервал между копиями, часов" type="number" min={1} max={24} required
            value={settings.backup_interval_hours} onChange={(event) => number('backup_interval_hours', event.target.value)} />
          <InputField label="Хранить последних копий" type="number" min={1} max={30} required
            value={settings.backup_retention_count} onChange={(event) => number('backup_retention_count', event.target.value)} />
        </div>
      </DeskSection>
      <div className={styles.actions}><button type="submit" disabled={busy}>Сохранить параметры</button>
        {saved && <span>Параметры сохранены</span>}</div>
    </form>}
    {error && <div className={deskError} role="alert">{error}</div>}
  </Desk>;
}
