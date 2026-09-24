import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { ActionButton, ActionRow } from '../components/ui/ActionButton';
import { Field } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { PanelList, PanelListItem, PanelTitle } from './Panel';
import panel from './Panel.module.css';

type Material = { id: string; title: string; filename: string; media_type: string; byte_size: number; created_at: string };

const mediaTypes: Record<string, string> = {
  'application/pdf': 'application/pdf',
  'text/plain': 'text/plain',
  'application/json': 'application/json',
  'audio/wav': 'audio/wav',
  'audio/mpeg': 'audio/mpeg',
  'audio/mp3': 'audio/mpeg',
};

export function Materials() {
  const { user } = useAuth();
  return <MaterialList teacher={user.role === 'teacher'} />;
}

export function MaterialsDrawer({ onClose }: { onClose: () => void }) {
  return <div className={panel.drawer}>
    <ActionRow><ActionButton onClick={onClose}>Закрыть</ActionButton></ActionRow>
    <MaterialList teacher={false} />
  </div>;
}

function MaterialList({ teacher }: { teacher: boolean }) {
  const [rows, setRows] = useState<Material[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => api<Material[]>('training/materials').then(setRows);
  useEffect(() => { void refresh().catch((cause: Error) => setError(cause.message)); }, []);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (form.elements.namedItem('file') as HTMLInputElement).files?.[0];
    const title = (form.elements.namedItem('title') as HTMLInputElement).value.trim();
    if (!file || !title) return;
    const media = mediaTypes[file.type];
    if (!media) { setError('Нужен файл PDF, TXT, JSON, WAV или MP3.'); return; }
    if (file.size > 96 * 1024) { setError('Файл больше 96 КиБ.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      }
      const content_base64 = btoa(binary);
      await api('training/materials', { title, filename: file.name, media_type: media, content_base64 });
      form.reset();
      await refresh();
      setMessage('Материал сохранён. Его видят обучающиеся ваших групп.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить материал.');
    } finally { setBusy(false); }
  }

  async function download(id: string) {
    const file = await api<{ filename: string; media_type: string; content_base64: string }>(`training/materials/${id}`);
    const bytes = Uint8Array.from(atob(file.content_base64), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: file.media_type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div>
    <PanelTitle>Учебные материалы</PanelTitle>
    <div>Методические файлы занятия. Обучающийся видит материалы преподавателей своих групп.</div>
    {teacher && <form onSubmit={(event) => void upload(event)}>
      <Field label="Название"><input name="title" required maxLength={200} /></Field>
      <div><label>Файл PDF, текст, JSON или аудио до 96 КиБ <input name="file" type="file" required
        accept="application/pdf,text/plain,application/json,audio/wav,audio/mpeg" /></label></div>
      <ActionButton type="submit" disabled={busy}>Загрузить материал</ActionButton>
    </form>}
    {error && <Notice error>{error}</Notice>}
    {message && <Notice>{message}</Notice>}
    {!rows.length && <div>Материалов пока нет.</div>}
    <PanelList>{rows.map((row) => <PanelListItem key={row.id}>
      {row.title} — {row.filename} — {row.byte_size} байт{' '}
      <button disabled={busy} onClick={() => void download(row.id).catch((cause: Error) => setError(cause.message))}>Скачать</button>
      {teacher && <button disabled={busy} onClick={() => {
        setBusy(true); setError('');
        void api(`training/materials/${row.id}/delete`, {})
          .then(refresh)
          .catch((cause: Error) => setError(cause.message))
          .finally(() => setBusy(false));
      }}>Удалить</button>}
    </PanelListItem>)}</PanelList>
  </div>;
}
