import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Snackbar } from './Snackbar';
import {
  SnackbarContext,
  type SnackbarApi,
  type SnackbarOptions,
} from './SnackbarContext';
import styles from './SnackbarProvider.module.css';

const DEFAULT_DURATION_MS = 3000;
const EXIT_FALLBACK_MS = 240;

type ActiveSnackbar = {
  hasCloseButton: boolean;
  id: string;
  isClosing: boolean;
  props: Omit<SnackbarOptions, 'duration'>;
};

type SnackbarProviderProps = {
  children: ReactNode;
};

let snackbarSequence = 0;

function createSnackbarId() {
  snackbarSequence += 1;
  return `snackbar-${snackbarSequence}`;
}

function clearTimer(
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
) {
  if (timerRef.current !== null) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

export function SnackbarProvider({ children }: SnackbarProviderProps) {
  const [activeSnackbar, setActiveSnackbar] = useState<ActiveSnackbar | null>(null);
  const activeSnackbarRef = useRef<ActiveSnackbar | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateActiveSnackbar = useCallback((snackbar: ActiveSnackbar | null) => {
    activeSnackbarRef.current = snackbar;
    setActiveSnackbar(snackbar);
  }, []);

  const finishClose = useCallback(
    (id: string) => {
      const currentSnackbar = activeSnackbarRef.current;

      if (!currentSnackbar || currentSnackbar.id !== id) {
        return;
      }

      clearTimer(dismissTimerRef);
      clearTimer(removeTimerRef);
      updateActiveSnackbar(null);
      currentSnackbar.props.onClose?.();
    },
    [updateActiveSnackbar],
  );

  const closeById = useCallback(
    (id?: string) => {
      const currentSnackbar = activeSnackbarRef.current;

      if (
        !currentSnackbar ||
        (id !== undefined && currentSnackbar.id !== id) ||
        currentSnackbar.isClosing
      ) {
        return;
      }

      clearTimer(dismissTimerRef);
      updateActiveSnackbar({ ...currentSnackbar, isClosing: true });
      removeTimerRef.current = setTimeout(
        () => finishClose(currentSnackbar.id),
        EXIT_FALLBACK_MS,
      );
    },
    [finishClose, updateActiveSnackbar],
  );

  const open = useCallback(
    (options: SnackbarOptions) => {
      const { duration = DEFAULT_DURATION_MS, ...props } = options;
      const previousSnackbar = activeSnackbarRef.current;
      const id = createSnackbarId();
      const snackbar = {
        hasCloseButton: duration <= 0,
        id,
        isClosing: false,
        props,
      };

      clearTimer(dismissTimerRef);
      clearTimer(removeTimerRef);
      previousSnackbar?.props.onClose?.();
      updateActiveSnackbar(snackbar);

      if (duration > 0) {
        dismissTimerRef.current = setTimeout(() => closeById(id), duration);
      }

      return {
        close: () => closeById(id),
        id,
      };
    },
    [closeById, updateActiveSnackbar],
  );

  useEffect(
    () => () => {
      clearTimer(dismissTimerRef);
      clearTimer(removeTimerRef);
    },
    [],
  );

  const api = useMemo<SnackbarApi>(
    () => ({ close: () => closeById(), open }),
    [closeById, open],
  );
  const portal =
    activeSnackbar !== null && typeof document !== 'undefined'
      ? createPortal(
          <div aria-live="polite" className={styles.viewport}>
            <div
              className={styles.item}
              data-closing={activeSnackbar.isClosing || undefined}
              key={activeSnackbar.id}
              onAnimationEnd={(event: AnimationEvent<HTMLDivElement>) => {
                if (
                  activeSnackbar.isClosing &&
                  event.target === event.currentTarget
                ) {
                  finishClose(activeSnackbar.id);
                }
              }}
            >
              <Snackbar
                {...activeSnackbar.props}
                onClose={
                  activeSnackbar.hasCloseButton
                    ? () => closeById(activeSnackbar.id)
                    : undefined
                }
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <SnackbarContext.Provider value={api}>
      {children}
      {portal}
    </SnackbarContext.Provider>
  );
}
