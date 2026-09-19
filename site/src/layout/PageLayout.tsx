import { Outlet } from 'react-router-dom';
import styles from './PageLayout.module.css';

export function PageLayout() {
  return (
    <div className={styles.page}>
      <Outlet />
    </div>
  );
}
