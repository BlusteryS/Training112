import { useEffect, useState } from 'react';
import { api } from '../api';
import { ModalForm } from '../components/ModalForm';
import { InputField } from '../components/ui/InputField';
import { SelectField } from '../components/ui/SelectField';
import { FormCard, formGrid } from './FormCard';
import { difficultyNames, type Group, type TrainingModule } from './types';

export function ModuleCreate({ groups, onClose, onCreated }: {
  groups: Group[];
  onClose: () => void;
  onCreated: (module: TrainingModule) => void;
}) {
  const [title, setTitle] = useState('');
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [difficulty, setDifficulty] = useState('basic');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!groupId && groups[0]) setGroupId(groups[0].id);
  }, [groupId, groups]);

  async function create() {
    if (!groupId || !title.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const module = await api<TrainingModule>('training/modules', { group_id: groupId, title: title.trim(), difficulty });
      onCreated(module);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать модуль.');
      setBusy(false);
    }
  }

  return <ModalForm label="Новый учебный модуль" onClose={onClose}>
    <FormCard title="Новый учебный модуль" submitLabel="Создать" busy={busy || !groupId || !title.trim()}
      error={error} onClose={onClose} onSubmit={() => void create()}>
      <div className={formGrid}>
        <InputField label="Название" value={title} maxLength={200}
          onChange={(event) => setTitle(event.target.value)} />
        <SelectField label="Группа" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </SelectField>
        <SelectField label="Сложность" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
          {Object.entries(difficultyNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </SelectField>
      </div>
    </FormCard>
  </ModalForm>;
}
