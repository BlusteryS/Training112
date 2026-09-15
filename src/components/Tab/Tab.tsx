import {
  forwardRef,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useTabsContext } from '../Tabs/TabsContext';
import styles from './Tab.module.css';

export type TabProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  after?: ReactNode;
  before?: ReactNode;
  children: ReactNode;
  id: string;
  selected?: boolean;
};

export const Tab = forwardRef<HTMLButtonElement, TabProps>(function Tab(
  {
    after,
    before,
    children,
    className,
    disabled = false,
    id,
    onClick,
    selected: selectedProp,
    tabIndex,
    type = 'button',
    ...props
  },
  ref,
) {
  const tabsContext = useTabsContext();
  const selected = selectedProp ?? (tabsContext?.selectedId === id);
  const hasManagedSelection = tabsContext?.selectedId !== undefined;
  const classes = [styles.tab, className].filter(Boolean).join(' ');

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);

    if (!event.defaultPrevented && id) {
      tabsContext?.onSelect(id);
    }
  };

  return (
    <button
      {...props}
      aria-selected={selected}
      className={classes}
      data-layout-fill-mode={tabsContext?.layoutFillMode ?? 'shrinked'}
      disabled={disabled}
      id={id}
      onClick={handleClick}
      ref={ref}
      role="tab"
      tabIndex={tabIndex ?? (hasManagedSelection ? (selected ? 0 : -1) : undefined)}
      type={type}
    >
      {before !== undefined ? (
        <span aria-hidden="true" className={styles.icon}>
          {before}
        </span>
      ) : null}
      <span className={styles.label}>{children}</span>
      {after !== undefined ? (
        <span aria-hidden="true" className={styles.icon}>
          {after}
        </span>
      ) : null}
    </button>
  );
});
