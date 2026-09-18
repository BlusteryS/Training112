import { createContext, useContext } from 'react';

export type TabsLayoutFillMode = 'auto' | 'stretched' | 'shrinked';

export type TabsContextValue = {
  layoutFillMode: TabsLayoutFillMode;
  onSelect: (id: string) => void;
  selectedId: string | undefined;
};

export const TabsContext = createContext<TabsContextValue | null>(null);

export function useTabsContext() {
  return useContext(TabsContext);
}
