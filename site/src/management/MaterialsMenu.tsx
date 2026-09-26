import { useState } from 'react';
import { api } from '../api';
import { ModalForm } from '../components/ModalForm';
import { FormCard, formChoice } from './FormCard';
import { downloadMaterial, type Material } from './materialDownload';

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
        {rows?.map((row) => <button key={row.id} className={formChoice} type="button"
          onClick={() => void downloadMaterial(row.id).catch((cause: Error) => setError(cause.message))}>{row.title}</button>)}
      </FormCard>
    </ModalForm>}
  </>;
}
