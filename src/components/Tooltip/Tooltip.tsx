import {
  arrow,
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useMergeRefs,
  useRole,
  useTransitionStyles,
} from '@floating-ui/react';
import {
  cloneElement,
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import styles from './Tooltip.module.css';

export type TooltipPlacement =
  | 'top-start'
  | 'top'
  | 'top-end'
  | 'right-start'
  | 'right'
  | 'right-end'
  | 'bottom-start'
  | 'bottom'
  | 'bottom-end'
  | 'left-start'
  | 'left'
  | 'left-end';

type TooltipChildProps = Record<string, unknown> & {
  ref?: Ref<HTMLElement>;
};

type TooltipContentProps =
  | {
      description?: ReactNode;
      title: ReactNode;
    }
  | {
      description: ReactNode;
      title?: ReactNode;
    };

type TooltipBaseProps = {
  children: ReactElement<TooltipChildProps>;
  closeDelay?: number;
  defaultShown?: boolean;
  disableFlipMiddleware?: boolean;
  disabled?: boolean;
  maxWidth?: CSSProperties['maxWidth'];
  offsetByCrossAxis?: number;
  offsetByMainAxis?: number;
  onShownChange?: (shown: boolean) => void;
  openDelay?: number;
  placement?: TooltipPlacement;
  shown?: boolean;
};

export type TooltipProps = TooltipBaseProps & TooltipContentProps;

const staticSideByPlacement = {
  bottom: 'top',
  left: 'right',
  right: 'left',
  top: 'bottom',
} as const;

export function Tooltip({
  children,
  closeDelay = 0,
  defaultShown = false,
  description,
  disableFlipMiddleware = false,
  disabled = false,
  maxWidth = 220,
  offsetByCrossAxis = 0,
  offsetByMainAxis = 8,
  onShownChange,
  openDelay = 0,
  placement = 'bottom',
  shown,
  title,
}: TooltipProps) {
  const arrowRef = useRef<HTMLSpanElement>(null);
  const [uncontrolledShown, setUncontrolledShown] = useState(defaultShown);
  const isControlled = shown !== undefined;
  const isShown = !disabled && (shown ?? uncontrolledShown);

  const handleShownChange = useCallback(
    (nextShown: boolean) => {
      if (!isControlled) {
        setUncontrolledShown(nextShown);
      }

      onShownChange?.(nextShown);
    },
    [isControlled, onShownChange],
  );

  const { context, floatingStyles, middlewareData, placement: currentPlacement, refs } =
    useFloating({
      middleware: [
        offset({ crossAxis: offsetByCrossAxis, mainAxis: offsetByMainAxis }),
        ...(disableFlipMiddleware ? [] : [flip({ padding: 8 })]),
        shift({ padding: 8 }),
        arrow({ element: arrowRef, padding: 8 }),
      ],
      onOpenChange: handleShownChange,
      open: isShown,
      placement,
      whileElementsMounted: autoUpdate,
    });
  const { setFloating, setReference } = refs;

  const hover = useHover(context, {
    delay: { close: closeDelay, open: openDelay },
    enabled: !disabled,
    move: false,
  });
  const focus = useFocus(context, { enabled: !disabled });
  const click = useClick(context, { enabled: !disabled, ignoreMouse: true });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getFloatingProps, getReferenceProps } = useInteractions([
    hover,
    focus,
    click,
    dismiss,
    role,
  ]);
  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    close: { opacity: 0, transform: 'scale(0.96)' },
    duration: { close: 80, open: 120 },
    initial: { opacity: 0, transform: 'scale(0.96)' },
    open: { opacity: 1, transform: 'scale(1)' },
  });

  const referenceRef = useMergeRefs<HTMLElement>([children.props.ref, setReference]);
  const side = currentPlacement.split('-')[0] as keyof typeof staticSideByPlacement;
  const staticSide = staticSideByPlacement[side];
  const arrowStyle = {
    left: middlewareData.arrow?.x,
    top: middlewareData.arrow?.y,
    [staticSide]: '-8px',
  };
  const surfaceStyle = {
    '--tooltip-max-width': typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth,
  } as CSSProperties;

  return (
    <>
      {cloneElement(
        children,
        getReferenceProps({
          ...children.props,
          ref: referenceRef,
        }),
      )}

      {isMounted ? (
        <FloatingPortal>
          <div
            {...getFloatingProps({
              className: styles.floating,
              ref: setFloating,
              style: floatingStyles,
            })}
          >
            <div className={styles.content} style={transitionStyles}>
              <span
                aria-hidden="true"
                className={styles.arrow}
                data-side={side}
                ref={arrowRef}
                style={arrowStyle}
              >
                {side === 'left' || side === 'right' ? (
                  <svg fill="none" height="20" viewBox="0 0 8 20" width="8">
                    <path
                      d="M0 10C0 7 8 4.0001 8 0V20C8 16.0251 0 13 0 10Z"
                      fill="currentColor"
                    />
                  </svg>
                ) : (
                  <svg fill="none" height="8" viewBox="0 0 20 8" width="20">
                    <path
                      d="M10 0C13 0 15.9999 8 20 8H0C3.9749 8 7 0 10 0Z"
                      fill="currentColor"
                    />
                  </svg>
                )}
              </span>

              <div className={styles.surface} style={surfaceStyle}>
                {title !== undefined ? <div className={styles.title}>{title}</div> : null}
                {description !== undefined ? (
                  <div className={styles.description}>{description}</div>
                ) : null}
              </div>
            </div>
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}
