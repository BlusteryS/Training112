import { InputField } from './InputField';

export function TextField({ label, value, onChange, placeholder, wide }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  return <InputField label={label} wide={wide} tone="search" value={value} placeholder={placeholder}
    onChange={(event) => onChange(event.target.value)} />;
}
