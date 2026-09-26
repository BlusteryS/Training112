import { useEffect, useState } from 'react';
import { api } from '../api';
import { ModalForm } from '../components/ModalForm';
import { FormCard, formChoice, formGrid } from './FormCard';
import { InputField } from '../components/ui/InputField';
import { Desk, DeskEmpty, DeskRow, DeskTable, deskActions, deskError } from './Desk';

type Material = { id: string; title: string; filename: string; media_type: string; byte_size: number };

const mediaTypes: Record<string, string> = {
  'application/pdf': 'application/pdf',
  'text/plain': 'text/plain',
  'application/json': 'application/json',
  'audio/wav': 'audio/wav',
  'audio/mpeg': 'audio/mpeg',
  'audio/mp3': 'audio/mpeg',
};

async function encode(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
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

export function Materials() {
  const [rows, setRows] = useState<Material[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => api<Material[]>('training/materials').then(setRows);
  useEffect(() => { void refresh().catch((cause: Error) => setError(cause.message)); }, []);
  return <Desk actions={<button type="button" onClick={() => { setError(''); setUploading(true); }}>Загрузить</button>}>
    {rows.length === 0 ? <DeskEmpty>Материалов нет</DeskEmpty> : <DeskTable head={<><span>Название</span><span>Файл</span><span>Байт</span><span /></>}>
      {rows.map((row) => <DeskRow key={row.id}>
        <span>{row.title}</span>
        <span>{row.filename}</span>
        <span>{row.byte_size}</span>
        <span className={deskActions}>
          <button type="button" onClick={() => void download(row.id).catch((cause: Error) => setError(cause.message))}>Скачать</button>
          <button type="button" disabled={busy} onClick={() => {
            setBusy(true); setError('');
            void api(`training/materials/${row.id}/delete`, {}).then(refresh).catch((cause: Error) => setError(cause.message)).finally(() => setBusy(false));
          }}>Удалить</button>
        </span>
      </DeskRow>)}
    </DeskTable>}
    {error && <div className={deskError} role="alert">{error}</div>}
    {uploading && <UploadDialog busy={busy} onClose={() => setUploading(false)} onSubmit={async (title, file) => {
      const media = mediaTypes[file.type];
      if (!media) throw new Error('Нужен файл PDF, TXT, JSON, WAV или MP3.');
      if (file.size > 96 * 1024) throw new Error('Файл больше 96 КиБ.');
      setBusy(true); setError('');
      try {
        await api('training/materials', { title, filename: file.name, media_type: media, content_base64: await encode(file) });
        await refresh();
        setUploading(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не удалось сохранить материал.');
      } finally { setBusy(false); }
    }} />}
  </Desk>;
}

export function MaterialsMenu() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Material[] | null>(null);
  const [error, setError] = useState('');
  return <>
    <button type="button" onClick={() => {
      setOpen(true);
      setError('');
      setRows(null);
      void api<Material[]>('training/materials').then(setRows).catch((cause: Error) => setError(cause.message));
    }}>Учебные материалы</button>
    {open && <ModalForm label="Материалы" onClose={() => setOpen(false)}>
      <FormCard title="Материалы" onClose={() => setOpen(false)}>
        {error && <div role="alert">{error}</div>}
        {rows && rows.length === 0 && <div>Материалов нет</div>}
        {rows?.map((row) => <button key={row.id} className={formChoice} type="button" onClick={() => void download(row.id).catch((cause: Error) => setError(cause.message))}>{row.title}</button>)}
      </FormCard>
    </ModalForm>}
  </>;
}

function UploadDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (title: string, file: File) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  return <ModalForm label="Материал" onClose={onClose}>
<FormCard title="Материал" submitLabel="Загрузить" busy={busy || !title.trim() || !file} error={error} onClose={onClose} onSubmit={() => {
    if (!file) return;
    void onSubmit(title.trim(), file).catch((cause: Error) => setError(cause.message));
  }}>
    <div className={formGrid}>
      <InputField label="Название" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
      <InputField label="Файл" type="file" accept="application/pdf,text/plain,application/json,audio/wav,audio/mpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
    </div>
  </FormCard>
</ModalForm>;
}
