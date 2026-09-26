import type { User } from '../auth/api';
import { SelectField } from '../components/ui/SelectField';

export const roleNames: Record<User['role'], string> = {
  user: 'Обучающийся',
  instructor: 'Преподаватель',
  admin: 'Администратор',
};

export function RoleField({ value, onChange }: {
  value: User['role'];
  onChange: (role: User['role']) => void;
}) {
  return <SelectField label="Роль" value={value}
    onChange={(event) => {
      if (Object.hasOwn(roleNames, event.target.value)) onChange(event.target.value as User['role']);
    }}>
    {Object.entries(roleNames).map(([role, name]) =>
      <option key={role} value={role}>{name}</option>)}
  </SelectField>;
}
