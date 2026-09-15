import type { Bounds } from './viewport';

/**
 * Clipping line-like objects to the visible rectangle.
 *
 * An infinite line has no endpoints to draw, and a ray has only one, so both
 * have to be cut down to the part that is on screen before they can be
 * stroked. Working in the line's own parameter t (0 at `from`, 1 at `to`) lets
 * one routine handle lines, rays and segments: they differ only in which
 * range of t they are allowed to occupy.
 */

export interface Segment {
  readonly from: { x: number; y: number };
  readonly to: { x: number; y: number };
}

export type ClipForm = 'line' | 'ray' | 'segment';

const FORM_RANGE: Record<ClipForm, { start: number; end: number }> = {
  line: { start: Number.NEGATIVE_INFINITY, end: Number.POSITIVE_INFINITY },
  ray: { start: 0, end: Number.POSITIVE_INFINITY },
  segment: { start: 0, end: 1 },
};

/**
 * The visible part of the line through `from` and `to`, or null when none of
 * it is in view. Liang-Barsky, extended to unbounded parameter ranges.
 */
export function clipLine(
  from: { x: number; y: number },
  to: { x: number; y: number },
  form: ClipForm,
  bounds: Bounds,
): Segment | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (!Number.isFinite(from.x) || !Number.isFinite(from.y)) return null;

  const xMin = Math.min(bounds.xMin, bounds.xMax);
  const xMax = Math.max(bounds.xMin, bounds.xMax);
  const yMin = Math.min(bounds.yMin, bounds.yMax);
  const yMax = Math.max(bounds.yMin, bounds.yMax);

  const range = FORM_RANGE[form];
  let start = range.start;
  let end = range.end;

  // Each edge of the rectangle either bounds t from below or from above.
  const edges: [number, number][] = [
    [-dx, from.x - xMin],
    [dx, xMax - from.x],
    [-dy, from.y - yMin],
    [dy, yMax - from.y],
  ];

  for (const [p, q] of edges) {
    if (p === 0) {
      // Parallel to this edge: either wholly inside it or wholly outside.
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) start = Math.max(start, t);
    else end = Math.min(end, t);
  }

  if (!(start <= end)) return null;

  return {
    from: { x: from.x + start * dx, y: from.y + start * dy },
    to: { x: from.x + end * dx, y: from.y + end * dy },
  };
}
