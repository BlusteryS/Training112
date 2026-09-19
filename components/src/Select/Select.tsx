import {
  Children,
  forwardRef,
  isValidElement,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Icon20ChevronDown, Icon24Close } from '@training112/icons';
import { classNames } from '../utils/classNames';
import { setRef } from '../utils/setRef';
import { IconButton } from '../IconButton';
import {
  FieldControl,
  FieldControlInput,
  type FieldControlStatus,
} from '../FieldControl/FieldControl';
import { Menu } from '../Menu';
import { MenuItem, type MenuItemProps } from '../MenuItem';
import styles from './Select.module.css';

export type SelectStatus = FieldControlStatus;

type SelectBaseProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  | 'children'
  | 'defaultValue'
  | 'multiple'
  | 'onChange'
  | 'readOnly'
  | 'size'
  | 'type'
  | 'value'
> & {
  before?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  defaultSearchValue?: string;
  menuLabel?: string;
  onOpenChange?: (open: boolean) => void;
  onSearchValueChange?: (value: string) => void;
  open?: boolean;
  searchable?: boolean;
  searchValue?: string;
  status?: SelectStatus;
};

type SelectSingleProps = {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  type?: 'single';
  value?: string;
};

type SelectMultipleProps = {
  defaultValue?: readonly string[];
  onValueChange?: (value: string[]) => void;
  type: 'multi';
  value?: readonly string[];
};

export type SelectProps = SelectBaseProps & (SelectSingleProps | SelectMultipleProps);
export type SelectType = NonNullable<SelectProps['type']>;

function normalizeValues(value: string | readonly string[] | undefined) {
  if (Array.isArray(value)) {
    return [...value];
  }

  return typeof value === 'string' ? [value] : [];
}

function getTextContent(content: ReactNode): string {
  if (typeof content === 'string' || typeof content === 'number') {
    return String(content);
  }

  if (Array.isArray(content)) {
    return content.map(getTextContent).join('');
  }

  if (isValidElement<{ children?: ReactNode }>(content)) {
    return getTextContent(content.props.children);
  }

  return '';
}

function getItemLabel(item: ReactElement<MenuItemProps>) {
  return getTextContent(item.props.title ?? item.props.children);
}

function isMenuItem(element: ReactNode): element is ReactElement<MenuItemProps> {
  return isValidElement<MenuItemProps>(element) && element.type === MenuItem;
}

function matchesSearch(item: ReactElement<MenuItemProps>, query: string) {
  return getItemLabel(item)
    .toLocaleLowerCase()
    .includes(query.trim().toLocaleLowerCase());
}

export const Select = forwardRef<HTMLInputElement, SelectProps>(function Select(
  {
    before,
    children,
    className,
    defaultOpen = false,
    defaultSearchValue = '',
    defaultValue,
    disabled = false,
    menuLabel = 'Варианты',
    name,
    onBlur,
    onFocus,
    onKeyDown,
    onOpenChange,
    onSearchValueChange,
    onValueChange,
    open,
    placeholder,
    searchable = false,
    searchValue,
    type = 'single',
    status = 'default',
    value,
    ...inputProps
  },
  ref,
) {
  const menuId = `${useId()}-menu`;
  const isMulti = type === 'multi';
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setInputRef = useCallback(
    (input: HTMLInputElement | null) => {
      inputRef.current = input;
      setRef(ref, input);
    },
    [ref],
  );
  const items = useMemo(() => Children.toArray(children).filter(isMenuItem), [children]);
  const controlledValues = useMemo(
    () => (value === undefined ? undefined : normalizeValues(value)),
    [value],
  );
  const [uncontrolledValues, setUncontrolledValues] = useState(() =>
    normalizeValues(defaultValue),
  );
  const currentValues = controlledValues ?? uncontrolledValues;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpenControlled = open !== undefined;
  const isOpen = open ?? uncontrolledOpen;
  const [uncontrolledSearchValue, setUncontrolledSearchValue] = useState(defaultSearchValue);
  const currentSearchValue = searchValue ?? uncontrolledSearchValue;
  const [isEditing, setIsEditing] = useState(false);
  const selectedValueSet = useMemo(() => new Set(currentValues), [currentValues]);
  const selectedItems = useMemo(
    () => items.filter((item) => selectedValueSet.has(item.props.value)),
    [items, selectedValueSet],
  );
  const displayValue = isMulti ? '' : selectedItems.map(getItemLabel).join(', ');
  const filterQuery = searchable && isEditing ? currentSearchValue : '';
  const filteredItems = useMemo(
    () => items.filter((item) => matchesSearch(item, filterQuery)),
    [filterQuery, items],
  );
  const hasNoResults = searchable && isEditing && filteredItems.length === 0;
  const isMenuShown = isOpen && filteredItems.length > 0;
  const selectedItem = !isMulti && selectedItems.length === 1 ? selectedItems[0] : undefined;
  const controlBefore =
    !isEditing && selectedItem !== undefined ? (selectedItem.props.before ?? before) : before;
  const inputValue = searchable && isEditing ? currentSearchValue : displayValue;
  const isInputCompact = isMulti && selectedItems.length > 0 && (!searchable || !isEditing);
  const currentStatus = hasNoResults ? 'error' : status;
  const ariaInvalid = currentStatus === 'error' ? true : inputProps['aria-invalid'];

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen === isOpen) {
        return;
      }

      if (!isOpenControlled) {
        setUncontrolledOpen(nextOpen);
      }

      onOpenChange?.(nextOpen);
    },
    [isOpen, isOpenControlled, onOpenChange],
  );

  const setSearchValue = useCallback(
    (nextSearchValue: string) => {
      if (searchValue === undefined) {
        setUncontrolledSearchValue(nextSearchValue);
      }

      onSearchValueChange?.(nextSearchValue);
    },
    [onSearchValueChange, searchValue],
  );

  const selectSingleValue = (nextValue: string) => {
    if (controlledValues === undefined) {
      setUncontrolledValues([nextValue]);
    }

    const nextItem = items.find((item) => item.props.value === nextValue);

    setIsEditing(false);
    setSearchValue(nextItem === undefined ? '' : getItemLabel(nextItem));
    (onValueChange as SelectSingleProps['onValueChange'])?.(nextValue);
  };

  const selectMultipleValues = (nextValues: string[]) => {
    if (controlledValues === undefined) {
      setUncontrolledValues(nextValues);
    }

    (onValueChange as SelectMultipleProps['onValueChange'])?.(nextValues);
  };

  const handleMenuOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen && filteredItems.length > 0);

    if (!nextOpen) {
      setIsEditing(false);
    }
  };

  const input = (
    <FieldControlInput
      {...inputProps}
      aria-autocomplete={searchable ? 'list' : 'none'}
      aria-controls={isMenuShown ? menuId : undefined}
      aria-expanded={isMenuShown}
      aria-haspopup="menu"
      aria-invalid={ariaInvalid}
      autoComplete="off"
      className={isMulti ? styles.multiInput : undefined}
      data-compact={isInputCompact || undefined}
      disabled={disabled}
      onBlur={(event) => {
        onBlur?.(event);
        setIsEditing(false);

        if (hasNoResults) {
          setOpen(false);
        }
      }}
      onChange={(event) => {
        const nextSearchValue = event.currentTarget.value;

        setSearchValue(nextSearchValue);
        setOpen(items.some((item) => matchesSearch(item, nextSearchValue)));
      }}
      onFocus={(event) => {
        onFocus?.(event);

        if (searchable && !disabled) {
          setIsEditing(true);
          setSearchValue(displayValue);
          setOpen(items.some((item) => matchesSearch(item, displayValue)));
        }
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);

        if (event.defaultPrevented || disabled) {
          return;
        }

        if (event.key === 'Escape' && isOpen) {
          event.preventDefault();
          setIsEditing(false);
          setOpen(false);
          return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setOpen(filteredItems.length > 0);
          return;
        }

        if (!searchable && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          setOpen(!isOpen);
        }
      }}
      placeholder={selectedItems.length === 0 ? placeholder : undefined}
      readOnly={!searchable}
      ref={setInputRef}
      role="combobox"
      type="text"
      value={inputValue}
    />
  );

  const control = (
    <FieldControl
      after={
        <span
          className={styles.chevron}
          data-disabled={disabled || undefined}
          data-open={isMenuShown}
        >
          <Icon20ChevronDown />
        </span>
      }
      as={isMulti ? 'div' : 'label'}
      before={controlBefore}
      className={classNames(className, isMulti && styles.multi)}
      data-has-value={currentValues.length > 0 || undefined}
      data-multi={isMulti || undefined}
      disabled={disabled}
      onMouseDown={
        isMulti
          ? (event) => {
              if (!disabled && event.button === 0) {
                event.preventDefault();
                inputRef.current?.focus();
              }
            }
          : undefined
      }
      onClick={() => {
        if (!disabled) {
          setOpen(searchable ? filteredItems.length > 0 : !isOpen);
        }
      }}
      readOnly={!searchable}
      status={currentStatus}
    >
      {isMulti ? (
        <span className={styles.multiContent}>
          {selectedItems.map((item) => {
            const label = getItemLabel(item);

            return (
              <span className={styles.chip} key={item.props.value}>
                <span>{label}</span>
                <IconButton
                  appearance="tertiary"
                  aria-label={`Удалить ${label}`}
                  disabled={disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectMultipleValues(
                      currentValues.filter(
                        (currentValue) => currentValue !== item.props.value,
                      ),
                    );
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  size="medium"
                >
                  <Icon24Close height={20} width={20} />
                </IconButton>
              </span>
            );
          })}
          {input}
        </span>
      ) : (
        input
      )}

      {name !== undefined
        ? currentValues.map((currentValue) => (
            <input key={currentValue} name={name} type="hidden" value={currentValue} />
          ))
        : null}
    </FieldControl>
  );

  if (isMulti) {
    return (
      <Menu
        aria-label={menuLabel}
        id={menuId}
        onOpenChange={handleMenuOpenChange}
        onValueChange={selectMultipleValues}
        open={isMenuShown}
        selectionIndicator="checkmark"
        selectionMode="multiple"
        trigger={control}
        triggerMode="manual"
        value={currentValues}
      >
        {filteredItems}
      </Menu>
    );
  }

  return (
    <Menu
      aria-label={menuLabel}
      id={menuId}
      onOpenChange={handleMenuOpenChange}
      onValueChange={selectSingleValue}
      open={isMenuShown}
      selectionIndicator="control"
      trigger={control}
      triggerMode="manual"
      value={currentValues[0]}
    >
      {filteredItems}
    </Menu>
  );
});
