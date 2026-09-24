import styles from './controls.module.css';

export function SectionTabs<T extends string>({ value, options, onChange }: {
  value: T;
  options: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return <div className={styles.tabs}>
    {(Object.entries(options) as [T, string][]).map(([id, title]) => <button key={id} type="button"
      aria-current={value === id ? 'page' : undefined} onClick={() => onChange(id)}>{title}</button>)}
  </div>;
}
