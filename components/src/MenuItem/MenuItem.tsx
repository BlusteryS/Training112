import {
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Icon20Check } from '@training112/icons';
import { classNames } from '../utils/classNames';
import { Checkbox } from '../Checkbox';
import { useMenuContext } from '../Menu/MenuContext';
import styles from './MenuItem.module.css';

type MenuItemBaseProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> & {
  before?: ReactNode;
  disabled?: boolean;
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

export const MenuItem = forwardRef<HTMLDivElement, MenuItemProps>(function MenuItem(
  {
    before,
    children,
    className,
    disabled = false,
    onClick,
    onKeyDown,
    selected: selectedProp,
    subtitle,
    tabIndex = -1,
    title,
    value,
    ...props
  },
  ref,
) {
  const menu = useMenuContext();
  const selected = selectedProp ?? menu?.selectedValues.has(value) ?? false;
  const selectionMode = menu?.selectionMode ?? 'single';
  const selectionIndicator = menu?.selectionIndicator ?? 'control';
  const label = title ?? children;
  const isRich = title !== undefined || subtitle !== undefined;
  const classes = classNames(styles.item, className);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }

    onClick?.(event);

    if (!event.defaultPrevented) {
      menu?.onSelect(value);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);

    if (
      event.defaultPrevented ||
      disabled ||
      (event.key !== 'Enter' && event.key !== ' ')
    ) {
      return;
    }

    event.preventDefault();
    menu?.onSelect(value);
  };

  return (
    <div
      {...props}
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      className={classes}
      data-disabled={disabled || undefined}
      data-rich={isRich || undefined}
      data-selection-indicator={selectionIndicator}
      data-selected={selected || undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      ref={ref}
      role={selectionMode === 'multiple' ? 'menuitemcheckbox' : 'menuitemradio'}
      tabIndex={disabled ? undefined : tabIndex}
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

        {selectionIndicator === 'checkmark' ? (
          selected ? (
            <span aria-hidden="true" className={styles.selection}>
              <Icon20Check />
            </span>
          ) : null
        ) : selectionIndicator === 'control' ? (
          <span aria-hidden="true" className={styles.selection}>
            <Checkbox
              checked={selected}
              disabled={disabled}
              padding={false}
              readOnly
              tabIndex={-1}
              variant={selectionMode === 'multiple' ? 'checkbox' : 'radio'}
            />
          </span>
        ) : null}
      </span>
    </div>
  );
});
