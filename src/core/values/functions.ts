import { ExpressionError } from '../expression/errors';
import {
  angleAt,
  circleThrough,
  distance,
  intersectLines,
  midpoint,
  parallelThrough,
  perpendicularThrough,
  polygonArea,
  polygonPerimeter,
  withinForm,
} from './geometry';
import {
  circle,
  describeKind,
  line,
  number,
  point,
  polygon,
  withArticle,
  type LineValue,
  type Point,
  type Value,
  type ValueKind,
} from './types';

/**
 * Functions over values.
 *
 * These sit beside the numeric registry in `core/expression/functions.ts`
 * rather than inside it, because they take and return values of several kinds
 * while the numeric registry is the unboxed path used for plotting. Both are
 * registries rather than `switch` statements, so the parser, the evaluator and
 * the on-screen reference all read the same list and it cannot drift.
 */

export interface ValueFunction {
  readonly name: string;
  readonly minArgs: number;
  readonly maxArgs: number;
  readonly apply: (args: readonly Value[]) => Value;
  readonly signature: string;
  readonly description: string;
}

export type ValueFunctionRegistry = ReadonlyMap<string, ValueFunction>;

function expect(args: readonly Value[], index: number, kind: ValueKind, name: string): Value {
  const argument = args[index];
  if (argument === undefined) {
    throw new ExpressionError(`${name} is missing argument ${index + 1}`);
  }
  if (argument.kind !== kind) {
    throw new ExpressionError(
      `${name} expects ${withArticle(kind)} as argument ${index + 1}, but got ${withArticle(argument.kind)}`,
    );
  }
  return argument;
}

function expectPoint(args: readonly Value[], index: number, name: string): Point {
  const value = expect(args, index, 'point', name);
  return value as Point;
}

function expectNumber(args: readonly Value[], index: number, name: string): number {
  const value = expect(args, index, 'number', name);
  return value.kind === 'number' ? value.value : NaN;
}

/** Accepts a line, ray or segment. */
function expectLine(args: readonly Value[], index: number, name: string): LineValue {
  const argument = args[index];
  if (argument === undefined || argument.kind !== 'line') {
    throw new ExpressionError(
      `${name} expects a line, ray or segment as argument ${index + 1}, but got ${
        argument === undefined ? 'nothing' : withArticle(argument.kind)
      }`,
    );
  }
  return argument;
}

function define(
  name: string,
  signature: string,
  description: string,
  minArgs: number,
  maxArgs: number,
  apply: (args: readonly Value[]) => Value,
): ValueFunction {
  return { name, signature, description, minArgs, maxArgs, apply };
}

const DEFINITIONS: readonly ValueFunction[] = [
  define('point', 'point(x, y)', 'The point at coordinates x, y', 2, 2, (args) =>
    point(expectNumber(args, 0, 'point'), expectNumber(args, 1, 'point')),
  ),

  define('midpoint', 'midpoint(A, B)', 'The point halfway between A and B', 2, 2, (args) => {
    const centre = midpoint(expectPoint(args, 0, 'midpoint'), expectPoint(args, 1, 'midpoint'));
    return point(centre.x, centre.y);
  }),

  define('distance', 'distance(A, B)', 'The distance between two points', 2, 2, (args) =>
    number(distance(expectPoint(args, 0, 'distance'), expectPoint(args, 1, 'distance'))),
  ),

  define('line', 'line(A, B)', 'The infinite line through A and B', 2, 2, (args) =>
    line(expectPoint(args, 0, 'line'), expectPoint(args, 1, 'line'), 'line'),
  ),

  define('segment', 'segment(A, B)', 'The segment from A to B', 2, 2, (args) =>
    line(expectPoint(args, 0, 'segment'), expectPoint(args, 1, 'segment'), 'segment'),
  ),

  define('ray', 'ray(A, B)', 'The ray from A through B', 2, 2, (args) =>
    line(expectPoint(args, 0, 'ray'), expectPoint(args, 1, 'ray'), 'ray'),
  ),

  define(
    'circle',
    'circle(centre, radius | point)',
    'A circle given its radius, or a point on it',
    2,
    2,
    (args) => {
      const centre = expectPoint(args, 0, 'circle');
      const second = args[1];
      if (second?.kind === 'number') return circle(centre, second.value);
      if (second?.kind === 'point') return circleThrough(centre, second);
      throw new ExpressionError(
        `circle expects a radius or a point as argument 2, but got ${
          second === undefined ? 'nothing' : withArticle(second.kind)
        }`,
      );
    },
  ),

  define('polygon', 'polygon(A, B, C, ...)', 'The polygon through the given points', 3, Infinity, (args) =>
    polygon(args.map((_, index) => expectPoint(args, index, 'polygon'))),
  ),

  define(
    'intersect',
    'intersect(a, b)',
    'Where two lines, rays or segments meet',
    2,
    2,
    (args) => {
      const first = expectLine(args, 0, 'intersect');
      const second = expectLine(args, 1, 'intersect');
      const meeting = intersectLines(first, second);
      if (meeting.point === null) {
        throw new ExpressionError('These are parallel, so they never meet');
      }
      if (
        !withinForm(first.form, meeting.alongFirst) ||
        !withinForm(second.form, meeting.alongSecond)
      ) {
        throw new ExpressionError(
          'These would meet outside the part that is drawn; use line(...) to extend them',
        );
      }
      return point(meeting.point.x, meeting.point.y);
    },
  ),

  define(
    'perpendicular',
    'perpendicular(line, P)',
    'The line through P at right angles to the given line',
    2,
    2,
    (args) => perpendicularThrough(expectLine(args, 0, 'perpendicular'), expectPoint(args, 1, 'perpendicular')),
  ),

  define(
    'parallel',
    'parallel(line, P)',
    'The line through P parallel to the given line',
    2,
    2,
    (args) => parallelThrough(expectLine(args, 0, 'parallel'), expectPoint(args, 1, 'parallel')),
  ),

  define(
    'angle',
    'angle(A, B, C)',
    'The angle at B, in radians, between BA and BC',
    3,
    3,
    (args) =>
      number(
        angleAt(
          expectPoint(args, 1, 'angle'),
          expectPoint(args, 0, 'angle'),
          expectPoint(args, 2, 'angle'),
        ),
      ),
  ),

  define('area', 'area(shape)', 'Area of a polygon or circle', 1, 1, (args) => {
    const shape = args[0];
    if (shape?.kind === 'polygon') return number(polygonArea(shape));
    if (shape?.kind === 'circle') return number(Math.PI * shape.radius * shape.radius);
    throw new ExpressionError(
      `area expects a polygon or a circle, but got ${
        shape === undefined ? 'nothing' : withArticle(shape.kind)
      }`,
    );
  }),

  define('perimeter', 'perimeter(shape)', 'Perimeter of a polygon, or a circle\'s circumference', 1, 1, (args) => {
    const shape = args[0];
    if (shape?.kind === 'polygon') return number(polygonPerimeter(shape));
    if (shape?.kind === 'circle') return number(2 * Math.PI * shape.radius);
    if (shape?.kind === 'line' && shape.form === 'segment') {
      return number(distance(shape.from, shape.to));
    }
    throw new ExpressionError(
      `perimeter expects a polygon or a circle, but got ${
        shape === undefined ? 'nothing' : withArticle(shape.kind)
      }`,
    );
  }),
];

export const VALUE_FUNCTIONS: ValueFunctionRegistry = new Map(
  DEFINITIONS.map((definition) => [definition.name, definition]),
);

export const VALUE_FUNCTION_LIST: readonly ValueFunction[] = DEFINITIONS;

export function valueArityMessage(definition: ValueFunction): string {
  const { minArgs, maxArgs, name } = definition;
  if (minArgs === maxArgs) {
    return `${name} takes ${minArgs} argument${minArgs === 1 ? '' : 's'}`;
  }
  if (maxArgs === Infinity) {
    return `${name} takes at least ${minArgs} argument${minArgs === 1 ? '' : 's'}`;
  }
  return `${name} takes between ${minArgs} and ${maxArgs} arguments`;
}

export { describeKind };
