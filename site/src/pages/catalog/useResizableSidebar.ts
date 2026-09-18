import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 240;
const MAX_WIDTH = 480;
const KEYBOARD_STEP = 8;

type ResizeStart = {
  pointerId: number;
  pointerX: number;
  width: number;
};

function clampWidth(width: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

export function useResizableSidebar() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStart = useRef<ResizeStart | null>(null);

  const updateWidth = (nextWidth: number) => setWidth(clampWidth(nextWidth));

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStart.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      width,
    };
    setIsResizing(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = resizeStart.current;

    if (start?.pointerId === event.pointerId) {
      updateWidth(start.width + event.clientX - start.pointerX);
    }
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (resizeStart.current?.pointerId !== event.pointerId) {
      return;
    }

    resizeStart.current = null;
    setIsResizing(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEYBOARD_STEP * 4 : KEYBOARD_STEP;
    let nextWidth: number;

    switch (event.key) {
      case 'ArrowLeft':
        nextWidth = width - step;
        break;
      case 'ArrowRight':
        nextWidth = width + step;
        break;
      case 'End':
        nextWidth = MAX_WIDTH;
        break;
      case 'Home':
        nextWidth = MIN_WIDTH;
        break;
      default:
        return;
    }

    event.preventDefault();
    updateWidth(nextWidth);
  };

  const handleLostPointerCapture = () => {
    resizeStart.current = null;
    setIsResizing(false);
  };

  return {
    isResizing,
    resizeHandleProps: {
      'aria-valuemax': MAX_WIDTH,
      'aria-valuemin': MIN_WIDTH,
      'aria-valuenow': width,
      onKeyDown: handleKeyDown,
      onLostPointerCapture: handleLostPointerCapture,
      onPointerCancel: handlePointerEnd,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerEnd,
    },
    width,
  };
}
