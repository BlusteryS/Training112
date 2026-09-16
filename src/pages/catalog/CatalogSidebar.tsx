import type { CSSProperties } from 'react';
import { Icon20ChevronRight } from '../../icons';
import styles from './CatalogSidebar.module.css';
import { useResizableSidebar } from './useResizableSidebar';

type CatalogSidebarItem = {
  id: string;
  label: string;
};

type CatalogSidebarProps = {
  activeId: string;
  isOpen: boolean;
  items: CatalogSidebarItem[];
  onClose: () => void;
};

export function CatalogSidebar({ activeId, isOpen, items, onClose }: CatalogSidebarProps) {
  const { isResizing, resizeHandleProps, width } = useResizableSidebar();
  const sidebarStyle = {
    '--sidebar-width': `${width}px`,
  } as CSSProperties;

  return (
    <>
      <button
        aria-hidden={!isOpen}
        aria-label="Закрыть меню"
        className={styles.backdrop}
        data-open={isOpen || undefined}
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />

      <aside
        className={styles.sidebar}
        data-open={isOpen || undefined}
        data-resizing={isResizing || undefined}
        id="catalog-sidebar"
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
                    onClick={onClose}
                  >
                    <span>{label}</span>
                    <Icon20ChevronRight />
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
    </>
  );
}
