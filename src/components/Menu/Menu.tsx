import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  safePolygon,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useMergeRefs,
  useTransitionStyles,
} from '@floating-ui/react';
import {
  cloneElement,
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type FocusEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { MenuContext, type MenuSelectionMode } from './MenuContext';
import styles from './Menu.module.css';

export type MenuTriggerMode = 'click' | 'hover' | 'manual';

type MenuTriggerProps = Record<string, unknown> & {
  ref?: Ref<HTMLElement>;
};

type MenuBaseProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'defaultValue' | 'title'> & {
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  title?: ReactNode;
  trigger?: ReactElement<MenuTriggerProps>;
  triggerMode?: MenuTriggerMode;
};

type MenuSingleSelectionProps = {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  selectionMode?: 'single';
  value?: string;
};

type MenuMultipleSelectionProps = {
  defaultValue?: readonly string[];
  onValueChange?: (value: string[]) => void;
  selectionMode: 'multiple';
  value?: readonly string[];
};

export type MenuProps = MenuBaseProps &
  (MenuSingleSelectionProps | MenuMultipleSelectionProps);

function getValues(
  selectionMode: MenuSelectionMode,
  value: string | readonly string[] | undefined,
) {
  if (selectionMode === 'multiple') {
    return Array.isArray(value) ? [...value] : [];
  }

  return typeof value === 'string' ? [value] : [];
}

function getEnabledItems(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      '[role="menuitemradio"]:not([aria-disabled="true"]), [role="menuitemcheckbox"]:not([aria-disabled="true"])',
    ),
  );
}

export const Menu = forwardRef<HTMLDivElement, MenuProps>(function Menu(
  {
    actions,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    children,
    className,
    defaultOpen = false,
    defaultValue,
    id,
    onFocus,
    onKeyDown,
    onOpenChange,
    onValueChange,
    open,
    selectionMode = 'single',
    tabIndex = 0,
    title,
    trigger,
    triggerMode = 'click',
    value,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const menuId = id ?? `${generatedId}-menu`;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpenControlled = open !== undefined;
  const isOpen = trigger !== undefined && (open ?? uncontrolledOpen);
  const controlledValues = useMemo(
    () => (value === undefined ? undefined : getValues(selectionMode, value)),
    [selectionMode, value],
  );
  const [uncontrolledValues, setUncontrolledValues] = useState(() =>
    getValues(selectionMode, defaultValue),
  );
  const currentValues = controlledValues ?? uncontrolledValues;
  const selectedValues = useMemo(() => new Set(currentValues), [currentValues]);
  const classes = [styles.menu, className].filter(Boolean).join(' ');

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!isOpenControlled) {
        setUncontrolledOpen(nextOpen);
      }

      onOpenChange?.(nextOpen);
    },
    [isOpenControlled, onOpenChange],
  );

  const { context, floatingStyles, refs } = useFloating({
    middleware: [
      offset(8),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        apply({ elements, rects }) {
          elements.floating.style.width = `${rects.reference.width}px`;
        },
        padding: 8,
      }),
    ],
    onOpenChange: handleOpenChange,
    open: isOpen,
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, {
    enabled: trigger !== undefined && triggerMode === 'hover',
    handleClose: safePolygon(),
    move: false,
  });
  const click = useClick(context, {
    enabled: trigger !== undefined && triggerMode === 'click',
  });
  const focus = useFocus(context, {
    enabled: trigger !== undefined && triggerMode === 'hover',
  });
  const dismiss = useDismiss(context, { enabled: trigger !== undefined });
  const { getFloatingProps, getReferenceProps } = useInteractions([
    hover,
    focus,
    click,
    dismiss,
  ]);
  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    close: { opacity: 0, transform: 'scale(0.98) translateY(-4px)' },
    duration: { close: 80, open: 120 },
    initial: { opacity: 0, transform: 'scale(0.98) translateY(-4px)' },
    open: { opacity: 1, transform: 'scale(1) translateY(0)' },
  });

  const selectValue = useCallback(
    (nextValue: string) => {
      if (selectionMode === 'multiple') {
        const nextValues = selectedValues.has(nextValue)
          ? currentValues.filter((currentValue) => currentValue !== nextValue)
          : [...currentValues, nextValue];

        if (controlledValues === undefined) {
          setUncontrolledValues(nextValues);
        }

        (onValueChange as MenuMultipleSelectionProps['onValueChange'])?.(nextValues);
        return;
      }

      if (controlledValues === undefined) {
        setUncontrolledValues([nextValue]);
      }

      (onValueChange as MenuSingleSelectionProps['onValueChange'])?.(nextValue);
      handleOpenChange(false);
    },
    [
      controlledValues,
      currentValues,
      handleOpenChange,
      onValueChange,
      selectedValues,
      selectionMode,
    ],
  );

  const contextValue = useMemo(
    () => ({
      onSelect: selectValue,
      selectedValues,
      selectionMode,
    }),
    [selectValue, selectedValues, selectionMode],
  );

  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    onFocus?.(event);

    if (event.defaultPrevented || event.target !== event.currentTarget) {
      return;
    }

    const items = getEnabledItems(event.currentTarget);
    const selectedItem = items.find((item) => item.getAttribute('aria-checked') === 'true');

    (selectedItem ?? items[0])?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);

    if (event.defaultPrevented) {
      return;
    }

    const items = getEnabledItems(event.currentTarget);

    if (items.length === 0) {
      return;
    }

    const currentItem =
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>(
            '[role="menuitemradio"], [role="menuitemcheckbox"]',
          )
        : null;
    const currentIndex = currentItem ? items.indexOf(currentItem) : -1;
    let nextIndex: number;

    switch (event.key) {
      case 'ArrowDown':
        nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'ArrowUp':
        nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    items[nextIndex]?.focus();
  };

  const surface = (
    <div
      {...props}
      aria-label={ariaLabel}
      aria-labelledby={
        ariaLabelledBy ?? (ariaLabel === undefined && title !== undefined ? titleId : undefined)
      }
      className={classes}
      id={menuId}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      ref={ref}
      role="menu"
      tabIndex={tabIndex}
    >
      {title !== undefined ? (
        <div className={styles.title} id={titleId}>
          {title}
        </div>
      ) : null}

      <div className={styles.items}>{children}</div>

      {actions !== undefined ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
  const triggerRef = useMergeRefs<HTMLElement>([trigger?.props.ref, refs.setReference]);

  if (trigger === undefined) {
    return <MenuContext.Provider value={contextValue}>{surface}</MenuContext.Provider>;
  }

  return (
    <MenuContext.Provider value={contextValue}>
      {cloneElement(
        trigger,
        getReferenceProps({
          ...trigger.props,
          'aria-controls': isOpen ? menuId : undefined,
          'aria-expanded': isOpen,
          'aria-haspopup': 'menu',
          ref: triggerRef,
        }),
      )}

      {isMounted ? (
        <FloatingPortal>
          <div
            {...getFloatingProps({
              className: styles.floating,
              ref: refs.setFloating,
              style: floatingStyles,
            })}
          >
            <div className={styles.transition} style={transitionStyles}>
              {surface}
            </div>
          </div>
        </FloatingPortal>
      ) : null}
    </MenuContext.Provider>
  );
});
