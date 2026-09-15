/**
 * The values a workspace item can hold.
 *
 * Milestone 1 and 2 only needed numbers. Geometry needs points and shapes,
 * and vectors, matrices and united quantities are coming, so the value domain
 * is a tagged union from here on: adding a kind is a deliberate change that
 * the type checker then points at every place that must handle it.
 *
 * Plotting deliberately does not use this union. A curve is sampled thousands
 * of times per frame and stays on the unboxed numeric path in
 * `core/expression/compile.ts`; values are computed once per change instead.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface NumberValue {
  readonly kind: 'number';
  readonly value: number;
}

export interface PointValue extends Point {
  readonly kind: 'point';
}

/** How much of the infinite line through `from` and `to` is drawn. */
export type LineForm = 'line' | 'ray' | 'segment';

export interface LineValue {
  readonly kind: 'line';
  readonly form: LineForm;
  readonly from: Point;
  readonly to: Point;
}

export interface CircleValue {
  readonly kind: 'circle';
  readonly center: Point;
  readonly radius: number;
}

export interface PolygonValue {
  readonly kind: 'polygon';
  readonly vertices: readonly Point[];
}

export type Value =
  | NumberValue
  | PointValue
  | LineValue
  | CircleValue
  | PolygonValue;

export type ValueKind = Value['kind'];

export const number = (value: number): NumberValue => ({ kind: 'number', value });

export const point = (x: number, y: number): PointValue => ({ kind: 'point', x, y });

export const line = (from: Point, to: Point, form: LineForm = 'line'): LineValue => ({
  kind: 'line',
  form,
  from: { x: from.x, y: from.y },
  to: { x: to.x, y: to.y },
});

export const circle = (center: Point, radius: number): CircleValue => ({
  kind: 'circle',
  center: { x: center.x, y: center.y },
  radius,
});

export const polygon = (vertices: readonly Point[]): PolygonValue => ({
  kind: 'polygon',
  vertices: vertices.map((vertex) => ({ x: vertex.x, y: vertex.y })),
});

export function isNumber(value: Value): value is NumberValue {
  return value.kind === 'number';
}

export function isPoint(value: Value): value is PointValue {
  return value.kind === 'point';
}

export function isLine(value: Value): value is LineValue {
  return value.kind === 'line';
}

/** True for values the canvas can draw. */
export function isGeometry(value: Value): boolean {
  return value.kind !== 'number';
}

/** The article-free name of a kind, for error messages. */
export function describeKind(kind: ValueKind): string {
  switch (kind) {
    case 'number':
      return 'number';
    case 'point':
      return 'point';
    case 'line':
      return 'line';
    case 'circle':
      return 'circle';
    case 'polygon':
      return 'polygon';
  }
}

/** "a number", "a point", "an angle"-style wording for messages. */
export function withArticle(kind: ValueKind): string {
  return `a ${describeKind(kind)}`;
}

/** Short human-readable form of a value, for lists and readouts. */
export function describeValue(value: Value, format: (n: number) => string): string {
  switch (value.kind) {
    case 'number':
      return format(value.value);
    case 'point':
      return `(${format(value.x)}, ${format(value.y)})`;
    case 'line': {
      const name = value.form === 'line' ? 'line' : value.form;
      return `${name} (${format(value.from.x)}, ${format(value.from.y)}) \u2192 (${format(value.to.x)}, ${format(value.to.y)})`;
    }
    case 'circle':
      return `circle at (${format(value.center.x)}, ${format(value.center.y)}), radius ${format(value.radius)}`;
    case 'polygon':
      return `polygon with ${value.vertices.length} vertices`;
  }
}
