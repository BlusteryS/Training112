import {
  forwardRef,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Icon20Check } from '../../icons';
import { useMenuContext } from '../Menu/MenuContext';
import styles from './MenuItem.module.css';

type MenuItemBaseProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'title' | 'value'
> & {
  before?: ReactNode;
  selected?: boolean;
  value: string;
};

type MenuItemSimpleContent = {
  children: ReactNode;
  subtitle?: never;
  title?: never;
};

type MenuItemDetailedContent = {
  children?: never;
  subtitle?: ReactNode;
  title: ReactNode;
};

export type MenuItemProps = MenuItemBaseProps &
  (MenuItemSimpleContent | MenuItemDetailedContent);

export const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
  {
    before,
    children,
    className,
    disabled = false,
    onClick,
    selected: selectedProp,
    subtitle,
    tabIndex = -1,
    title,
    type = 'button',
    value,
    ...props
  },
  ref,
) {
  const menu = useMenuContext();
  const selected = selectedProp ?? menu?.selectedValues.has(value) ?? false;
  const selectionMode = menu?.selectionMode ?? 'single';
  const label = title ?? children;
  const isRich = title !== undefined || subtitle !== undefined;
  const classes = [styles.item, className].filter(Boolean).join(' ');

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);

    if (!event.defaultPrevented) {
      menu?.onSelect(value);
    }
  };

  return (
    <button
      {...props}
      aria-checked={selected}
      className={classes}
      data-rich={isRich || undefined}
      data-selected={selected || undefined}
      disabled={disabled}
      onClick={handleClick}
      ref={ref}
      role={selectionMode === 'multiple' ? 'menuitemcheckbox' : 'menuitemradio'}
      tabIndex={tabIndex}
      type={type}
    >
      <span className={styles.content}>
        {before !== undefined ? (
          <span aria-hidden="true" className={styles.before}>
            {before}
          </span>
        ) : null}

        <span className={styles.text}>
          <span className={styles.label}>{label}</span>
          {subtitle !== undefined ? <span className={styles.subtitle}>{subtitle}</span> : null}
        </span>

        <span aria-hidden="true" className={styles.indicator} data-mode={selectionMode}>
          <Icon20Check className={styles.checkmark} />
        </span>
      </span>
    </button>
  );
});
