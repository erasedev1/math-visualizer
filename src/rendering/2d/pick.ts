import { POINT_RADIUS, type SceneObject } from './objects';
import { toScreenX, toScreenY, type Point, type Viewport } from './viewport';

/** How far from a point the pointer may be and still grab it, in CSS pixels. */
export const PICK_RADIUS = POINT_RADIUS + 6;

/**
 * The movable point under a screen position, if any.
 *
 * Later objects win, so the most recently defined point is picked when several
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
    if (object.kind !== 'point' || !object.movable) continue;
    const dx = toScreenX(viewport, object.at.x) - screen.x;
    const dy = toScreenY(viewport, object.at.y) - screen.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = object.id;
    }
  }

  return best;
}
