import { useEffect, useState } from 'react';
import { api } from '../api';
import { ModalForm } from '../components/ModalForm';
import { FormCard, formGrid } from './FormCard';
import { InputField } from '../components/ui/InputField';
import { Desk, DeskEmpty, DeskRow, DeskTable, deskActionHead, deskActions, deskError } from './Desk';

import { downloadMaterial, type Material } from './materialDownload';
import { formatBytes } from '../formatBytes';

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
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)));
  return btoa(chunks.join(''));
}

export function Materials() {
  const [rows, setRows] = useState<Material[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => api<Material[]>('training/materials').then(setRows);
  useEffect(() => { void refresh().catch((cause: Error) => setError(cause.message)); }, []);
  return <Desk actions={<button type="button" onClick={() => { setError(''); setUploading(true); }}>Загрузить</button>}>
    {rows.length === 0 ? <DeskEmpty>Материалов нет</DeskEmpty> : <DeskTable actionsRight head={<><span>Название</span><span>Файл</span><span>Размер</span><span className={deskActionHead}>Действия</span></>}>
      {rows.map((row) => <DeskRow key={row.id}>
        <span>{row.title}</span>
        <span>{row.filename}</span>
        <span>{formatBytes(row.byte_size)}</span>
        <span className={deskActions}>
          <button type="button" onClick={() => void downloadMaterial(row.id).catch((cause: Error) => setError(cause.message))}>Скачать</button>
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
      if (file.size > 8 * 1024 * 1024) throw new Error('Файл больше 8 МиБ.');
      setBusy(true); setError('');
      try {
        await api('training/materials', { title, filename: file.name, media_type: media, content_base64: await encode(file) });
        await refresh();
        setUploading(false);
      } finally { setBusy(false); }
    }} />}
  </Desk>;
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
