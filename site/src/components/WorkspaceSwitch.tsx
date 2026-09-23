import styles from './WorkspaceSwitch.module.css';

export function WorkspaceSwitch({ checked, children, onChange }: {
  checked: boolean;
  children: string;
  onChange: (checked: boolean) => void;
}) {
  return <label className={styles.switch}>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span aria-hidden="true" />
    {children}
  </label>;
}
