import { handleOf, POINT_RADIUS, type SceneObject } from './objects';
import { toScreenX, toScreenY, type Point, type Viewport } from './viewport';

/** How far from a point the pointer may be and still grab it, in CSS pixels. */
export const PICK_RADIUS = POINT_RADIUS + 6;

/**
 * The movable handle under a screen position, if any: a free point, or the tip
 * of a free vector.
 *
 * Later objects win, so the most recently defined one is picked when several
 * overlap, and distance is measured in screen pixels so the grab area stays
 * the same size however far the view is zoomed.
 */
export function pickPoint(
  objects: readonly SceneObject[],
  screen: Point,
  viewport: Viewport,
  radius = PICK_RADIUS,
): string | null {
  let best: string | null = null;
  let bestDistance = radius;

  for (const object of objects) {
    const handle = handleOf(object);
    if (handle === null) continue;
    const dx = toScreenX(viewport, handle.x) - screen.x;
    const dy = toScreenY(viewport, handle.y) - screen.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = object.id;
    }
  }

  return best;
}
