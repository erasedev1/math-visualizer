import { useEffect, type RefObject } from 'react';
import type { Point } from '@/rendering/2d/viewport';

export interface ObjectDragOptions {
  /** Returns the id of a movable object at a local position, or null. */
  readonly pick: (local: Point) => string | null;
  /** Called with the pointer's world position while dragging. */
  readonly onDrag: (id: string, local: Point) => void;
  readonly onDragChange?: (dragging: boolean) => void;
}

/**
 * Dragging geometric objects.
 *
 * Panning and dragging share one surface, so both consult the same `pick`
 * function: this hook claims the gesture when it lands on a movable object,
 * and the navigation hook declines to pan in exactly that case. Neither
 * depends on which listener was registered first.
 */
export function useObjectDrag(
  target: RefObject<HTMLElement | null>,
  options: ObjectDragOptions,
): void {
  const { pick, onDrag, onDragChange } = options;

  useEffect(() => {
    const element = target.current;
    if (element === null) return;

    let draggingId: string | null = null;

    const localPoint = (event: PointerEvent): Point => {
      const rect = element.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      const id = pick(localPoint(event));
      if (id === null) return;
      draggingId = id;
      element.setPointerCapture(event.pointerId);
      onDragChange?.(true);
      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent) => {
      const local = localPoint(event);
      if (draggingId !== null) {
        onDrag(draggingId, local);
        return;
      }
      // Hovering is reflected straight on the element, so moving the pointer
      // across the canvas never triggers a React render.
      element.dataset.hover = pick(local) === null ? '' : 'object';
    };

    const endDrag = (event: PointerEvent) => {
      if (draggingId === null) return;
      draggingId = null;
      onDragChange?.(false);
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', endDrag);
    element.addEventListener('pointercancel', endDrag);

    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', endDrag);
      element.removeEventListener('pointercancel', endDrag);
      delete element.dataset.hover;
    };
  }, [target, pick, onDrag, onDragChange]);
}
