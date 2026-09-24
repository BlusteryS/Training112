import styles from './ToggleGroup.module.css';

export function ToggleGroup<T extends string>({ value, options, onChange }: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return <div className={styles.group}>
    {options.map((option) => <button className={option.value === value ? styles.active : ''}
      key={option.value} type="button" onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}
