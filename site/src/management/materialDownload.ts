import { api } from '../api';

export type Material = {
  id: string;
  title: string;
  filename: string;
  media_type: string;
  byte_size: number;
};

export async function downloadMaterial(id: string) {
  const file = await api<{ filename: string; media_type: string; content_base64: string }>(`training/materials/${id}`);
  const bytes = Uint8Array.from(atob(file.content_base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.media_type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
