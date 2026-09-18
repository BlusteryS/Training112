import { lazy, Suspense, useEffect, useState } from 'react';
import { AppRail } from './catalog/AppRail';
import { CatalogSidebar } from './catalog/CatalogSidebar';
import styles from './ComponentCatalogPage.module.css';

const showcaseById = {
  avatar: lazy(() => import('./catalog/AvatarShowcase')),
  badge: lazy(() => import('./catalog/BadgeShowcase')),
  button: lazy(() => import('./catalog/ButtonShowcase')),
  card: lazy(() => import('./catalog/CardShowcase')),
  cell: lazy(() => import('./catalog/CellShowcase')),
  checkbox: lazy(() => import('./catalog/CheckboxShowcase')),
  iconButton: lazy(() => import('./catalog/IconButtonShowcase')),
  input: lazy(() => import('./catalog/InputShowcase')),
  menu: lazy(() => import('./catalog/MenuShowcase')),
  modal: lazy(() => import('./catalog/ModalShowcase')),
  placeholder: lazy(() => import('./catalog/PlaceholderShowcase')),
  progress: lazy(() => import('./catalog/ProgressShowcase')),
  search: lazy(() => import('./catalog/SearchShowcase')),
  select: lazy(() => import('./catalog/SelectShowcase')),
  separator: lazy(() => import('./catalog/SeparatorShowcase')),
  snackbar: lazy(() => import('./catalog/SnackbarShowcase')),
  switch: lazy(() => import('./catalog/SwitchShowcase')),
  tabs: lazy(() => import('./catalog/TabsShowcase')),
  tooltip: lazy(() => import('./catalog/TooltipShowcase')),
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
  {
    id: 'card',
    label: 'Card',
  },
  {
    id: 'cell',
    label: 'Cell',
  },
  {
    id: 'checkbox',
    label: 'Checkbox',
  },
  {
    id: 'iconButton',
    label: 'IconButton',
  },
  {
    id: 'input',
    label: 'Input',
  },
  {
    id: 'menu',
    label: 'Menu',
  },
  {
    id: 'modal',
    label: 'Modal',
  },
  {
    id: 'placeholder',
    label: 'Placeholder',
  },
  {
    id: 'progress',
    label: 'Progress',
  },
  {
    id: 'search',
    label: 'Search',
  },
  {
    id: 'select',
    label: 'Select',
  },
  {
    id: 'separator',
    label: 'Separator',
  },
  {
    id: 'snackbar',
    label: 'Snackbar',
  },
  {
    id: 'switch',
    label: 'Switch',
  },
  {
    id: 'tabs',
    label: 'Tabs',
  },
  {
    id: 'tooltip',
    label: 'Tooltip',
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
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const ActiveShowcase = showcaseById[activeComponentId];

  useEffect(() => {
    const handleHashChange = () => {
      setActiveComponentId(getComponentFromHash());
      setIsNavigationOpen(false);
    };

    window.addEventListener('hashchange', handleHashChange);

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!isNavigationOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNavigationOpen(false);
      }
    };
    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    const previousOverflow = document.body.style.overflow;

    if (isMobile) {
      document.body.style.overflow = 'hidden';
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNavigationOpen]);

  return (
    <div className={styles.shell}>
      <AppRail
        isNavigationOpen={isNavigationOpen}
        onNavigationToggle={() => setIsNavigationOpen((isOpen) => !isOpen)}
      />
      <CatalogSidebar
        activeId={activeComponentId}
        isOpen={isNavigationOpen}
        items={navigationItems}
        onClose={() => setIsNavigationOpen(false)}
      />

      <main className={styles.content} id={activeComponentId}>
        <Suspense fallback={null}>
          <ActiveShowcase />
        </Suspense>
      </main>
    </div>
  );
}
