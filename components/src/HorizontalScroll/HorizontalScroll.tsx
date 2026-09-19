import {
  forwardRef,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Icon20ChevronRight } from '@training112/icons';
import { IconButton } from '../IconButton';
import { classNames } from '../utils/classNames';
import styles from './HorizontalScroll.module.css';

export type HorizontalScrollProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  bleed?: boolean;
  children: ReactNode;
  showArrows?: boolean;
};

export const HorizontalScroll = forwardRef<HTMLDivElement, HorizontalScrollProps>(function HorizontalScroll(
  {
    'aria-label': label,
    bleed = false,
    children,
    className,
    onScroll,
    showArrows = true,
    tabIndex = 0,
    ...props
  },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; scrollLeft: number } | null>(null);
  const suppressClickRef = useRef(false);
  const viewportId = useId();
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const updateArrows = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const maxScroll = viewport.scrollWidth - viewport.clientWidth;
    const isRtl = getComputedStyle(viewport).direction === 'rtl';
    setCanScrollLeft(isRtl ? viewport.scrollLeft > -maxScroll + 1 : viewport.scrollLeft > 1);
    setCanScrollRight(isRtl ? viewport.scrollLeft < -1 : viewport.scrollLeft < maxScroll - 1);
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    updateArrows();
    const observer = new ResizeObserver(updateArrows);
    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  }, [updateArrows]);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    suppressClickRef.current = false;
    const viewport = event.currentTarget;
    if (
      event.defaultPrevented ||
      event.pointerType !== 'mouse' ||
      event.button !== 0 ||
      viewport.scrollWidth <= viewport.clientWidth ||
      (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"]'))
    ) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: viewport.scrollLeft,
    };
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;

    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if ((event.buttons & 1) === 0) {
      finishDrag(event);
      return;
    }

    const distance = event.clientX - drag.startX;
    if (!suppressClickRef.current) {
      if (Math.abs(distance) < 4) return;
      suppressClickRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
    }

    event.preventDefault();
    event.currentTarget.scrollLeft = drag.scrollLeft - distance;
  };

  const scroll = (direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    viewport.scrollBy({
      left: direction * viewport.clientWidth * 0.8,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  };

  return (
    <div {...props} className={classNames(styles.root, className)} data-bleed={bleed || undefined} ref={ref}>
      <div
        aria-label={label}
        className={styles.viewport}
        data-dragging={isDragging || undefined}
        data-scrollable={canScrollLeft || canScrollRight || undefined}
        id={viewportId}
        onClickCapture={(event) => {
          if (!suppressClickRef.current || event.detail === 0) return;
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onDragStart={(event) => {
          if (dragRef.current) event.preventDefault();
        }}
        onLostPointerCapture={finishDrag}
        onPointerCancel={finishDrag}
        onPointerDown={startDrag}
        onPointerLeave={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) finishDrag(event);
        }}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onScroll={(event) => {
          updateArrows();
          onScroll?.(event);
        }}
        ref={viewportRef}
        role="region"
        tabIndex={tabIndex}
      >
        <div className={styles.content} ref={contentRef}>
          {children}
        </div>
      </div>
      {showArrows && canScrollLeft ? (
        <IconButton
          aria-controls={viewportId}
          aria-label="Прокрутить влево"
          className={classNames(styles.arrow, styles.left)}
          onClick={() => scroll(-1)}
          size="large"
        >
          <Icon20ChevronRight className={styles.leftIcon} />
        </IconButton>
      ) : null}
      {showArrows && canScrollRight ? (
        <IconButton
          aria-controls={viewportId}
          aria-label="Прокрутить вправо"
          className={classNames(styles.arrow, styles.right)}
          onClick={() => scroll(1)}
          size="large"
        >
          <Icon20ChevronRight />
        </IconButton>
      ) : null}
    </div>
  );
});
