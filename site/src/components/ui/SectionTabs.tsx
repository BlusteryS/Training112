import { NavLink } from 'react-router-dom';
import styles from './controls.module.css';

export function SectionTabs({ options, basePath }: {
  options: Record<string, string>;
  basePath: string;
}) {
  return <div className={styles.tabs}>
    {Object.entries(options).map(([id, title]) => <NavLink key={id}
      to={`${basePath}/${id}`}>{title}</NavLink>)}
  </div>;
}
