import type { CSSProperties } from 'react';
import { ChevronRightIcon } from '../../icons/ChevronRightIcon';
import styles from './CatalogSidebar.module.css';
import { useResizableSidebar } from './useResizableSidebar';

type CatalogSidebarItem = {
  id: string;
  label: string;
};

type CatalogSidebarProps = {
  activeId: string;
  items: CatalogSidebarItem[];
};

export function CatalogSidebar({ activeId, items }: CatalogSidebarProps) {
  const { isResizing, resizeHandleProps, width } = useResizableSidebar();
  const sidebarStyle = {
    '--sidebar-width': `${width}px`,
  } as CSSProperties;

  return (
    <aside
      className={styles.sidebar}
      data-resizing={isResizing || undefined}
      style={sidebarStyle}
    >
      <div className={styles.scrollArea}>
        <header className={styles.header}>
          <p className={styles.title}>Компоненты</p>
        </header>

        <nav aria-label="Компоненты" className={styles.navigation}>
          <ul className={styles.list}>
            {items.map(({ id, label }) => (
              <li key={id}>
                <a
                  aria-current={activeId === id ? 'page' : undefined}
                  className={styles.link}
                  href={`#${id}`}
                >
                  <span>{label}</span>
                  <ChevronRightIcon />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div
        {...resizeHandleProps}
        aria-label="Изменить ширину боковой панели"
        aria-orientation="vertical"
        className={styles.resizeHandle}
        role="separator"
        tabIndex={0}
      />
    </aside>
  );
}
