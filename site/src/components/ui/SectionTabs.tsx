import { NavLink } from 'react-router-dom';
import styles from './controls.module.css';

export function SectionTabs<T extends string>({ value, options, basePath }: {
  value: T;
  options: Record<T, string>;
  basePath: string;
}) {
  return <div className={styles.tabs}>
    {(Object.entries(options) as [T, string][]).map(([id, title]) => <NavLink key={id}
      aria-current={value === id ? 'page' : undefined} to={`${basePath}/${id}`}>{title}</NavLink>)}
  </div>;
}
