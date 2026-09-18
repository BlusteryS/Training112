import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { classNames } from '../utils/classNames';
import { setRef } from '../utils/setRef';
import { TabsContext, type TabsLayoutFillMode } from './TabsContext';
import styles from './Tabs.module.css';

export type TabsProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  children: ReactNode;
  defaultSelectedId?: string;
  layoutFillMode?: TabsLayoutFillMode;
  onSelectedIdChange?: (id: string) => void;
  scrollBehaviorToSelectedTab?: ScrollLogicalPosition;
  selectedId?: string;
  withScrollToSelectedTab?: boolean;
};

export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  {
    children,
    className,
    defaultSelectedId,
    layoutFillMode = 'auto',
    onKeyDown,
    onSelectedIdChange,
    scrollBehaviorToSelectedTab = 'nearest',
    selectedId,
    withScrollToSelectedTab = false,
    ...props
  },
  forwardedRef,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [uncontrolledSelectedId, setUncontrolledSelectedId] = useState(defaultSelectedId);
  const isControlled = selectedId !== undefined;
  const currentSelectedId = selectedId ?? uncontrolledSelectedId;
  const classes = classNames(styles.tabs, className);

  const setRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      setRef(forwardedRef, node);
    },
    [forwardedRef],
  );

  const selectTab = useCallback(
    (id: string) => {
      if (!isControlled) {
        setUncontrolledSelectedId(id);
      }

      onSelectedIdChange?.(id);
    },
    [isControlled, onSelectedIdChange],
  );

  const contextValue = useMemo(
    () => ({
      layoutFillMode,
      onSelect: selectTab,
      selectedId: currentSelectedId,
    }),
    [currentSelectedId, layoutFillMode, selectTab],
  );

  useEffect(() => {
    if (!withScrollToSelectedTab || currentSelectedId === undefined) {
      return;
    }

    rootRef.current
      ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: scrollBehaviorToSelectedTab });
  }, [currentSelectedId, scrollBehaviorToSelectedTab, withScrollToSelectedTab]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);

    if (event.defaultPrevented || !(event.target instanceof HTMLElement)) {
      return;
    }

    const currentTab = event.target.closest<HTMLElement>('[role="tab"]');

    if (!currentTab || !event.currentTarget.contains(currentTab)) {
      return;
    }

    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
    );
    const currentIndex = tabs.indexOf(currentTab as HTMLButtonElement);

    if (currentIndex === -1) {
      return;
    }

    const isRtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const previousKey = isRtl ? 'ArrowRight' : 'ArrowLeft';
    const nextKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
    let nextIndex: number;

    switch (event.key) {
      case previousKey:
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case nextKey:
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    const nextTab = tabs[nextIndex];

    if (nextTab) {
      event.preventDefault();
      nextTab.focus();
      nextTab.click();
    }
  };

  return (
    <TabsContext.Provider value={contextValue}>
      <div
        {...props}
        className={classes}
        data-layout-fill-mode={layoutFillMode}
        onKeyDown={handleKeyDown}
        ref={setRootRef}
        role="tablist"
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
});
