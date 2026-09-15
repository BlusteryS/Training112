import { lazy, Suspense, useEffect, useState } from 'react';
import { AppRail } from './catalog/AppRail';
import { CatalogSidebar } from './catalog/CatalogSidebar';
import styles from './ComponentCatalogPage.module.css';

const showcaseById = {
  avatar: lazy(() => import('./catalog/AvatarShowcase')),
  badge: lazy(() => import('./catalog/BadgeShowcase')),
  button: lazy(() => import('./catalog/ButtonShowcase')),
};

type ComponentId = keyof typeof showcaseById;

type NavigationItem = {
  id: ComponentId;
  label: string;
};

const navigationItems: NavigationItem[] = [
  {
    id: 'avatar',
    label: 'Avatar',
  },
  {
    id: 'badge',
    label: 'Badge',
  },
  {
    id: 'button',
    label: 'Button',
  },
];

function getComponentFromHash(): ComponentId {
  if (typeof window === 'undefined') {
    return 'avatar';
  }

  const componentId = window.location.hash.slice(1);

  return Object.hasOwn(showcaseById, componentId) ? (componentId as ComponentId) : 'avatar';
}

export function ComponentCatalogPage() {
  const [activeComponentId, setActiveComponentId] = useState<ComponentId>(getComponentFromHash);
  const ActiveShowcase = showcaseById[activeComponentId];

  useEffect(() => {
    const handleHashChange = () => setActiveComponentId(getComponentFromHash());

    window.addEventListener('hashchange', handleHashChange);

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <div className={styles.shell}>
      <AppRail />
      <CatalogSidebar activeId={activeComponentId} items={navigationItems} />

      <main className={styles.content} id={activeComponentId}>
        <Suspense fallback={<div className={styles.loading}>Загрузка компонента…</div>}>
          <ActiveShowcase />
        </Suspense>
      </main>
    </div>
  );
}
