import { createContext, useContext } from 'react';

export type MenuSelectionMode = 'single' | 'multiple';

export type MenuContextValue = {
  onSelect: (value: string) => void;
  selectedValues: ReadonlySet<string>;
  selectionMode: MenuSelectionMode;
};

export const MenuContext = createContext<MenuContextValue | null>(null);

export function useMenuContext() {
  return useContext(MenuContext);
}
