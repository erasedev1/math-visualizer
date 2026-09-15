import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { pan, zoomAt, type Viewport } from '@/rendering/2d/viewport';

/** Wheel notches are converted to a zoom factor through this exponent base. */
const WHEEL_ZOOM_BASE = 1.0015;
const MAX_WHEEL_DELTA = 240;

export interface PointerNavigationOptions {
  readonly viewportRef: RefObject<Viewport>;
  readonly onChange: (next: Viewport) => void;
  /** Called when a gesture starts and ends, so rendering can drop quality. */
  readonly onInteractingChange?: (interacting: boolean) => void;
}

interface ActivePointer {
  x: number;
  y: number;
}

/**
 * Drag to pan, wheel to zoom, two fingers to pinch.
 *
 * The gesture state lives in refs and the viewport is read through a ref, so a
 * drag never depends on React having re-rendered between two pointer events.
 */
export function usePointerNavigation(
  target: RefObject<HTMLElement | null>,
  options: PointerNavigationOptions,
): void {
  const { viewportRef, onChange, onInteractingChange } = options;
  const pointers = useRef(new Map<number, ActivePointer>());
  const pinchDistance = useRef<number | null>(null);

  const setInteracting = useCallback(
    (interacting: boolean) => onInteractingChange?.(interacting),
    [onInteractingChange],
  );

  useEffect(() => {
    const element = target.current;
    if (element === null) return;

    const localPoint = (event: PointerEvent | WheelEvent) => {
      const rect = element.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      element.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, localPoint(event));
      if (pointers.current.size === 1) setInteracting(true);
      if (pointers.current.size === 2) pinchDistance.current = currentPinchDistance();
    };

    const currentPinchDistance = (): number | null => {
      const [first, second] = [...pointers.current.values()];
      if (first === undefined || second === undefined) return null;
      return Math.hypot(second.x - first.x, second.y - first.y);
    };

    const pinchCenter = () => {
      const [first, second] = [...pointers.current.values()];
      if (first === undefined || second === undefined) return null;
      return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    };

    const onPointerMove = (event: PointerEvent) => {
      const previous = pointers.current.get(event.pointerId);
      if (previous === undefined) return;
      const next = localPoint(event);
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      pointers.current.set(event.pointerId, next);

      const viewport = viewportRef.current;
      if (viewport === null) return;

      if (pointers.current.size >= 2) {
        const distance = currentPinchDistance();
        const center = pinchCenter();
        const previousDistance = pinchDistance.current;
        if (distance !== null && center !== null && previousDistance !== null && previousDistance > 0) {
          pinchDistance.current = distance;
          onChange(zoomAt(viewport, center, distance / previousDistance));
        }
        return;
      }

      onChange(pan(viewport, dx, dy));
    };

    const endPointer = (event: PointerEvent) => {
      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) pinchDistance.current = null;
      if (pointers.current.size === 0) {
        setInteracting(false);
        if (element.hasPointerCapture(event.pointerId)) {
          element.releasePointerCapture(event.pointerId);
        }
      }
    };

    const onWheel = (event: WheelEvent) => {
      const viewport = viewportRef.current;
      if (viewport === null) return;
      event.preventDefault();

      // Trackpads report many small deltas and mice a few large ones; clamping
      // keeps a single notch from jumping several zoom levels.
      const delta = Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, event.deltaY));
      const factor = Math.pow(WHEEL_ZOOM_BASE, -delta);
      const axis = event.shiftKey ? 'x' : event.altKey ? 'y' : 'both';
      onChange(zoomAt(viewport, localPoint(event), factor, { axis }));
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', endPointer);
    element.addEventListener('pointercancel', endPointer);
    element.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', endPointer);
      element.removeEventListener('pointercancel', endPointer);
      element.removeEventListener('wheel', onWheel);
      pointers.current.clear();
    };
  }, [target, viewportRef, onChange, setInteracting]);
}
