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
import * as linear from './matrix';
import {
  circle,
  describeKind,
  line,
  matrix,
  number,
  point,
  polygon,
  vector,
  withArticle,
  type LineValue,
  type MatrixValue,
  type Point,
  type Value,
  type ValueKind,
  type VectorValue,
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

function expectVector(args: readonly Value[], index: number, name: string): VectorValue {
  const argument = args[index];
  if (argument === undefined || argument.kind !== 'vector') {
    throw new ExpressionError(
      `${name} expects a vector as argument ${index + 1}, but got ${
        argument === undefined ? 'nothing' : withArticle(argument.kind)
      }`,
    );
  }
  return argument;
}

function expectMatrix(args: readonly Value[], index: number, name: string): MatrixValue {
  const argument = args[index];
  if (argument === undefined || argument.kind !== 'matrix') {
    throw new ExpressionError(
      `${name} expects a matrix as argument ${index + 1}, but got ${
        argument === undefined ? 'nothing' : withArticle(argument.kind)
      }`,
    );
  }
  return argument;
}

function expectSquare(args: readonly Value[], index: number, name: string): MatrixValue {
  const value = expectMatrix(args, index, name);
  if (!linear.isSquare(value.rows)) {
    const { rows, columns } = linear.dimensions(value.rows);
    throw new ExpressionError(`${name} needs a square matrix, but this one is ${rows}\u00d7${columns}`);
  }
  return value;
}

/** Vectors of matching length, for the products that need one. */
function expectPair(args: readonly Value[], name: string): [VectorValue, VectorValue] {
  const first = expectVector(args, 0, name);
  const second = expectVector(args, 1, name);
  if (first.components.length !== second.components.length) {
    throw new ExpressionError(
      `${name} needs vectors of the same length, but these have ${first.components.length} and ${second.components.length} components`,
    );
  }
  return [first, second];
}

function dotProduct(a: VectorValue, b: VectorValue): number {
  return a.components.reduce((total, component, i) => total + component * b.components[i]!, 0);
}

function magnitudeOf(value: VectorValue): number {
  return Math.hypot(...value.components);
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
    'angle(A, B, C) or angle(v, w)',
    'The angle at B between BA and BC, or between two vectors',
    2,
    3,
    (args) => {
      if (args.length === 2) {
        const [a, b] = expectPair(args, 'angle');
        const lengths = magnitudeOf(a) * magnitudeOf(b);
        if (lengths === 0) {
          throw new ExpressionError('A zero vector has no direction, so there is no angle');
        }
        // Clamped because rounding can push the ratio just outside [-1, 1].
        return number(Math.acos(Math.min(1, Math.max(-1, dotProduct(a, b) / lengths))));
      }
      return number(
        angleAt(
          expectPoint(args, 1, 'angle'),
          expectPoint(args, 0, 'angle'),
          expectPoint(args, 2, 'angle'),
        ),
      );
    },
  ),

  // Vectors.
  define(
    'vector',
    'vector(x, y, ...) or vector(A, B)',
    'A vector from its components, or the arrow from A to B',
    2,
    Infinity,
    (args) => {
      const [first, second] = args;
      if (first?.kind === 'point' && second?.kind === 'point' && args.length === 2) {
        return vector([second.x - first.x, second.y - first.y], first);
      }
      return vector(args.map((_, index) => expectNumber(args, index, 'vector')));
    },
  ),

  define('magnitude', 'magnitude(v)', 'Length of a vector', 1, 1, (args) =>
    number(magnitudeOf(expectVector(args, 0, 'magnitude'))),
  ),

  define('normalize', 'normalize(v)', 'The unit vector in the same direction', 1, 1, (args) => {
    const value = expectVector(args, 0, 'normalize');
    const length = magnitudeOf(value);
    if (length === 0) throw new ExpressionError('A zero vector has no direction to normalize');
    return vector(value.components.map((component) => component / length), value.anchor);
  }),

  define('dot', 'dot(v, w)', 'Dot product of two vectors', 2, 2, (args) =>
    number(dotProduct(...expectPair(args, 'dot'))),
  ),

  define(
    'cross',
    'cross(v, w)',
    'Cross product: a vector in 3D, a number in 2D',
    2,
    2,
    (args) => {
      const [a, b] = expectPair(args, 'cross');
      if (a.components.length === 2) {
        return number(a.components[0]! * b.components[1]! - a.components[1]! * b.components[0]!);
      }
      if (a.components.length === 3) {
        const [ax, ay, az] = a.components as [number, number, number];
        const [bx, by, bz] = b.components as [number, number, number];
        return vector([ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx]);
      }
      throw new ExpressionError('cross needs vectors with 2 or 3 components');
    },
  ),

  define(
    'projection',
    'projection(v, onto)',
    'The part of v that lies along another vector',
    2,
    2,
    (args) => {
      const [value, onto] = expectPair(args, 'projection');
      const lengthSquared = dotProduct(onto, onto);
      if (lengthSquared === 0) {
        throw new ExpressionError('Cannot project onto a zero vector');
      }
      const factor = dotProduct(value, onto) / lengthSquared;
      return vector(onto.components.map((component) => component * factor), onto.anchor);
    },
  ),

  // Matrices.
  define('identity', 'identity(n)', 'The n by n identity matrix', 1, 1, (args) => {
    const size = Math.round(expectNumber(args, 0, 'identity'));
    if (!Number.isFinite(size) || size < 1 || size > 64) {
      throw new ExpressionError('identity needs a whole number of rows between 1 and 64');
    }
    return matrix(linear.identity(size));
  }),

  define('transpose', 'transpose(M)', 'The matrix with rows and columns swapped', 1, 1, (args) =>
    matrix(linear.transpose(expectMatrix(args, 0, 'transpose').rows)),
  ),

  define('det', 'det(M)', 'Determinant of a square matrix', 1, 1, (args) =>
    number(linear.determinant(expectSquare(args, 0, 'det').rows)),
  ),

  define('rank', 'rank(M)', 'Number of independent rows', 1, 1, (args) =>
    number(linear.rank(expectMatrix(args, 0, 'rank').rows)),
  ),

  define('inverse', 'inverse(M)', 'The inverse of a square matrix', 1, 1, (args) => {
    const result = linear.inverse(expectSquare(args, 0, 'inverse').rows);
    if (result === null) {
      throw new ExpressionError('This matrix is singular, so it has no inverse');
    }
    return matrix(result);
  }),

  define(
    'solve',
    'solve(M, b)',
    'Solves the linear system M x = b',
    2,
    2,
    (args) => {
      const system = expectSquare(args, 0, 'solve');
      const target = expectVector(args, 1, 'solve');
      const { rows } = linear.dimensions(system.rows);
      if (rows !== target.components.length) {
        throw new ExpressionError(
          `solve needs a vector with ${rows} components to match a ${rows}\u00d7${rows} matrix`,
        );
      }
      const solution = linear.solve(system.rows, target.components);
      if (solution === null) {
        throw new ExpressionError('This system has no single solution');
      }
      return vector(solution);
    },
  ),

  define(
    'eigenvalues',
    'eigenvalues(M)',
    'Real eigenvalues, largest first, as one row',
    1,
    1,
    (args) => matrix([eigenOf(args, 'eigenvalues').values]),
  ),

  define(
    'eigenvectors',
    'eigenvectors(M)',
    'Eigenvectors as the columns of a matrix',
    1,
    1,
    (args) => matrix(linear.transpose(eigenOf(args, 'eigenvectors').vectors)),
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

/** Shared by eigenvalues and eigenvectors, including the honest refusal. */
function eigenOf(args: readonly Value[], name: string): linear.Eigen {
  const value = expectSquare(args, 0, name);
  const result = linear.eigen(value.rows);
  if (result === null) {
    throw new ExpressionError(
      linear.dimensions(value.rows).rows > 2
        ? `${name} handles symmetric matrices of any size and any 2\u00d72 matrix; this one is neither`
        : 'This matrix has no real eigenvalues',
    );
  }
  return result;
}

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
