import { createContext, useContext } from 'react';

export type MenuSelectionMode = 'single' | 'multiple' | 'none';
export type MenuSelectionIndicator = 'control' | 'checkmark' | 'none';

export type MenuContextValue = {
  onSelect: (value?: string) => void;
  selectionIndicator: MenuSelectionIndicator;
  selectedValues: ReadonlySet<string>;
  selectionMode: MenuSelectionMode;
};

export const MenuContext = createContext<MenuContextValue | null>(null);

export function useMenuContext() {
  return useContext(MenuContext);
}
