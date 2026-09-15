import { circle, line, point, type CircleValue, type LineValue, type Point, type PolygonValue } from './types';

/**
 * Plane geometry.
 *
 * Pure functions over plain coordinates, with no knowledge of expressions,
 * the workspace or the canvas, so every construction can be checked directly
 * against its analytical result.
 */

/** Distance below which two coordinates are treated as the same point. */
export const EPSILON = 1e-10;

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function direction(from: Point, to: Point): Point {
  return { x: to.x - from.x, y: to.y - from.y };
}

export function samePoint(a: Point, b: Point): boolean {
  return distance(a, b) <= EPSILON;
}

/** Signed area of the parallelogram spanned by two vectors. */
export function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

/**
 * The interior angle at `vertex`, in radians, between the rays to `a` and `b`.
 * Uses atan2 of the cross and dot products rather than acos of a ratio, which
 * loses all precision for angles near 0 and pi.
 */
export function angleAt(vertex: Point, a: Point, b: Point): number {
  const u = direction(vertex, a);
  const v = direction(vertex, b);
  return Math.abs(Math.atan2(cross(u, v), dot(u, v)));
}

/** The line through `through`, parallel to the given line. */
export function parallelThrough(source: LineValue, through: Point): LineValue {
  const step = direction(source.from, source.to);
  return line(through, { x: through.x + step.x, y: through.y + step.y });
}

/** The line through `through`, perpendicular to the given line. */
export function perpendicularThrough(source: LineValue, through: Point): LineValue {
  const step = direction(source.from, source.to);
  // Rotating the direction a quarter turn keeps the construction exact.
  return line(through, { x: through.x - step.y, y: through.y + step.x });
}

export interface LineIntersection {
  readonly point: Point | null;
  /** Position along each line, where 0 is `from` and 1 is `to`. */
  readonly alongFirst: number;
  readonly alongSecond: number;
  readonly parallel: boolean;
}

/** Intersection of the infinite lines carrying two line-like objects. */
export function intersectLines(first: LineValue, second: LineValue): LineIntersection {
  const u = direction(first.from, first.to);
  const v = direction(second.from, second.to);
  const denominator = cross(u, v);

  if (Math.abs(denominator) <= EPSILON) {
    return { point: null, alongFirst: NaN, alongSecond: NaN, parallel: true };
  }

  const offset = direction(first.from, second.from);
  const alongFirst = cross(offset, v) / denominator;
  const alongSecond = cross(offset, u) / denominator;

  return {
    point: { x: first.from.x + alongFirst * u.x, y: first.from.y + alongFirst * u.y },
    alongFirst,
    alongSecond,
    parallel: false,
  };
}

/** Whether a position along a line lies within what that form actually draws. */
export function withinForm(form: LineValue['form'], along: number): boolean {
  switch (form) {
    case 'line':
      return true;
    case 'ray':
      return along >= -EPSILON;
    case 'segment':
      return along >= -EPSILON && along <= 1 + EPSILON;
  }
}

/** A circle centred at `center` passing through `through`. */
export function circleThrough(center: Point, through: Point): CircleValue {
  return circle(center, distance(center, through));
}

export function polygonPerimeter(shape: PolygonValue): number {
  const { vertices } = shape;
  if (vertices.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < vertices.length; i += 1) {
    total += distance(vertices[i]!, vertices[(i + 1) % vertices.length]!);
  }
  return total;
}

/** Unsigned area, by the shoelace formula. */
export function polygonArea(shape: PolygonValue): number {
  const { vertices } = shape;
  if (vertices.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < vertices.length; i += 1) {
    const current = vertices[i]!;
    const next = vertices[(i + 1) % vertices.length]!;
    total += cross(current, next);
  }
  return Math.abs(total) / 2;
}

/** Closest point to `target` on the infinite line through a line-like object. */
export function projectOnto(source: LineValue, target: Point): Point {
  const step = direction(source.from, source.to);
  const lengthSquared = dot(step, step);
  if (lengthSquared <= EPSILON) return { x: source.from.x, y: source.from.y };
  const along = dot(direction(source.from, target), step) / lengthSquared;
  return { x: source.from.x + along * step.x, y: source.from.y + along * step.y };
}

export { point };
