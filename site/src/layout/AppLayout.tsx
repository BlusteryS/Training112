import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import styles from './AppLayout.module.css';

export function AppLayout() {
  return (
    <div className={styles.layout}>
      <AppSidebar />
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}
