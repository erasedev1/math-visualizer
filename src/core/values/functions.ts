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
import * as stats from './statistics';
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

/** The heading a function is listed under in the on-screen reference. */
export type ValueFunctionGroup = 'Geometry' | 'Statistics';

export interface ValueFunction {
  readonly name: string;
  /** Defaults to Geometry, which is where everything started out. */
  readonly group?: ValueFunctionGroup | undefined;
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

/**
 * A one-based index into a matrix, as people write them. Returns the
 * zero-based position the arrays actually use.
 */
function expectIndex(
  args: readonly Value[],
  position: number,
  available: number,
  name: string,
  what: string,
): number {
  const raw = expectNumber(args, position, name);
  if (!Number.isInteger(raw)) {
    throw new ExpressionError(`${name} needs a whole ${what} number, but got ${raw}`);
  }
  if (raw < 1 || raw > available) {
    throw new ExpressionError(
      `This matrix has ${available} ${what}${available === 1 ? '' : 's'}, so ${what} ${raw} does not exist`,
    );
  }
  return raw - 1;
}

function dotProduct(a: VectorValue, b: VectorValue): number {
  return a.components.reduce((total, component, i) => total + component * b.components[i]!, 0);
}

function magnitudeOf(value: VectorValue): number {
  return Math.hypot(...value.components);
}

/**
 * A sample of observations: one matrix or vector, or the numbers written out.
 *
 * A matrix is read row by row, so a data set can be typed as `[4, 8, 15]` and
 * a column of one can be used just as readily. Writing the numbers directly —
 * `mean(1, 2, 3)` — reads better for a handful of them, and costs nothing
 * because a lone number is already a sample of one.
 */
function expectSample(args: readonly Value[], name: string): number[] {
  const first = args[0];
  if (args.length === 1 && first !== undefined) {
    if (first.kind === 'matrix') return first.rows.flatMap((row) => [...row]);
    if (first.kind === 'vector') return [...first.components];
  }
  return args.map((_, index) => expectNumber(args, index, name));
}

/** A sample given as a single matrix or vector, for the functions that take two. */
function expectSampleAt(args: readonly Value[], index: number, name: string): number[] {
  const argument = args[index];
  if (argument?.kind === 'matrix') return argument.rows.flatMap((row) => [...row]);
  if (argument?.kind === 'vector') return [...argument.components];
  throw new ExpressionError(
    `${name} expects a list of numbers as argument ${index + 1}, but got ${
      argument === undefined ? 'nothing' : withArticle(argument.kind)
    }`,
  );
}

/**
 * Two samples of matching length, written either as two arguments or as one
 * matrix of two rows.
 *
 * The second form is the same convention the canvas already uses: the columns
 * of a two-row matrix are points in the plane, so `[[1, 2, 3], [2, 4, 5]]` is
 * three points and `fit` of it is the line through them.
 */
function expectPairedSamples(args: readonly Value[], name: string): [number[], number[]] {
  let xs: number[];
  let ys: number[];

  const only = args[0];
  if (args.length === 1) {
    if (only?.kind !== 'matrix' || only.rows.length !== 2) {
      throw new ExpressionError(
        `${name} of one argument needs a matrix of two rows, the x values and the y values`,
      );
    }
    xs = [...only.rows[0]!];
    ys = [...only.rows[1]!];
  } else {
    xs = expectSampleAt(args, 0, name);
    ys = expectSampleAt(args, 1, name);
  }

  if (xs.length !== ys.length) {
    throw new ExpressionError(
      `${name} needs the same number of x and y values, but got ${xs.length} and ${ys.length}`,
    );
  }
  if (xs.length < 2) {
    throw new ExpressionError(`${name} needs at least two points, but got ${xs.length}`);
  }
  return [xs, ys];
}

/**
 * A spread, refused by name when there are too few observations to measure
 * one. A sample estimator divides by n - 1, so it needs two of them.
 */
function expectSpread(
  args: readonly Value[],
  name: string,
  spread: stats.Spread,
  compute: (data: readonly number[], spread: stats.Spread) => number | null,
): Value {
  const data = expectSample(args, name);
  const result = compute(data, spread);
  if (result === null) {
    const needed = spread === 'sample' ? 'two observations' : 'one observation';
    throw new ExpressionError(
      `${name} needs at least ${needed} to measure a spread, but got ${data.length}`,
    );
  }
  return number(result);
}

function define(
  name: string,
  signature: string,
  description: string,
  minArgs: number,
  maxArgs: number,
  apply: (args: readonly Value[]) => Value,
  group: ValueFunctionGroup = 'Geometry',
): ValueFunction {
  return { name, group, signature, description, minArgs, maxArgs, apply };
}

/**
 * A statistic: one number read off a sample, taken variadically so that both
 * `mean(data)` and `mean(1, 2, 3)` reach the same routine.
 */
function stat(
  name: string,
  signature: string,
  description: string,
  compute: (data: readonly number[]) => number,
): ValueFunction {
  return define(
    name,
    signature,
    description,
    1,
    Infinity,
    (args) => number(compute(expectSample(args, name))),
    'Statistics',
  );
}

/** A statistic that has no answer for a sample too small to measure. */
function spread(
  name: string,
  description: string,
  estimator: stats.Spread,
  compute: (data: readonly number[], spread: stats.Spread) => number | null,
): ValueFunction {
  return define(
    name,
    `${name}(data)`,
    description,
    1,
    Infinity,
    (args) => expectSpread(args, name, estimator, compute),
    'Statistics',
  );
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
    'column',
    'column(M, j)',
    'The j-th column of a matrix, as a vector. Columns count from 1',
    2,
    2,
    (args) => {
      const source = expectMatrix(args, 0, 'column');
      const { rows, columns } = linear.dimensions(source.rows);
      const index = expectIndex(args, 1, columns, 'column', 'column');
      return vector(source.rows.map((entry) => entry[index]!).slice(0, rows));
    },
  ),

  define(
    'row',
    'row(M, i)',
    'The i-th row of a matrix, as a vector. Rows count from 1',
    2,
    2,
    (args) => {
      const source = expectMatrix(args, 0, 'row');
      const { rows } = linear.dimensions(source.rows);
      const index = expectIndex(args, 1, rows, 'row', 'row');
      return vector(source.rows[index]!);
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

  // Statistics. Each takes a sample: one matrix or vector, or loose numbers.
  stat('count', 'count(data)', 'How many observations there are', (data) => data.length),
  stat('sum', 'sum(data)', 'The total of the observations', stats.sum),
  stat('mean', 'mean(data)', 'The arithmetic mean', stats.mean),
  stat('median', 'median(data)', 'The middle observation', stats.median),
  stat('min', 'min(data) or min(a, b, ...)', 'The smallest observation', stats.smallest),
  stat('max', 'max(data) or max(a, b, ...)', 'The largest observation', stats.largest),
  stat('range', 'range(data)', 'Largest observation minus smallest', (data) =>
    stats.largest(data) - stats.smallest(data),
  ),
  stat(
    'iqr',
    'iqr(data)',
    'Interquartile range: the width of the middle half',
    stats.interquartileRange,
  ),

  define(
    'mode',
    'mode(data)',
    'The most common observation',
    1,
    Infinity,
    (args) => {
      const data = expectSample(args, 'mode');
      if (stats.highestFrequency(data) === 1) {
        throw new ExpressionError('Every observation occurs once, so there is no mode');
      }
      const common = stats.modes(data);
      if (common.length > 1) {
        throw new ExpressionError(
          `These observations are equally common, so there is no single mode: ${common.join(', ')}`,
        );
      }
      return number(common[0]!);
    },
    'Statistics',
  ),

  spread('variance', 'Sample variance, dividing by n - 1', 'sample', stats.variance),
  spread(
    'stddev',
    'Sample standard deviation, dividing by n - 1',
    'sample',
    stats.standardDeviation,
  ),
  spread('variancep', 'Population variance, dividing by n', 'population', stats.variance),
  spread(
    'stddevp',
    'Population standard deviation, dividing by n',
    'population',
    stats.standardDeviation,
  ),

  define(
    'quantile',
    'quantile(data, p)',
    'The observation p of the way through the data, p from 0 to 1',
    2,
    2,
    (args) => {
      const data = expectSampleAt(args, 0, 'quantile');
      const p = expectNumber(args, 1, 'quantile');
      if (!(p >= 0 && p <= 1)) {
        throw new ExpressionError(`quantile needs a fraction between 0 and 1, but got ${p}`);
      }
      return number(stats.quantile(data, p));
    },
    'Statistics',
  ),

  define(
    'covariance',
    'covariance(xs, ys)',
    'Sample covariance of two samples of equal length',
    1,
    2,
    (args) => {
      const [xs, ys] = expectPairedSamples(args, 'covariance');
      const result = stats.covariance(xs, ys, 'sample');
      if (result === null) {
        throw new ExpressionError('covariance needs at least two points to measure a spread');
      }
      return number(result);
    },
    'Statistics',
  ),

  define(
    'correlation',
    'correlation(xs, ys)',
    "Pearson's correlation coefficient, between -1 and 1",
    1,
    2,
    (args) => {
      const [xs, ys] = expectPairedSamples(args, 'correlation');
      const r = stats.correlation(xs, ys);
      if (r === null) {
        throw new ExpressionError(
          'One of these samples never varies, so there is no correlation to measure',
        );
      }
      return number(r);
    },
    'Statistics',
  ),

  define(
    'fit',
    'fit(xs, ys)',
    'The least-squares line through the points, drawn on the graph',
    1,
    2,
    (args) => {
      const [xs, ys] = expectPairedSamples(args, 'fit');
      const fitted = stats.leastSquares(xs, ys);
      if (fitted === null) {
        throw new ExpressionError(
          'Every x is the same here, so the best line is vertical and is not a function of x',
        );
      }
      // Two points one apart in x, so slope() and intercept() read the
      // coefficients back exactly. The line is infinite, so where it is
      // anchored never shows.
      return line(
        { x: 0, y: fitted.intercept },
        { x: 1, y: fitted.intercept + fitted.slope },
        'line',
      );
    },
    'Statistics',
  ),

  define(
    'rsquared',
    'rsquared(xs, ys)',
    'The fraction of the variation in y the least-squares line accounts for',
    1,
    2,
    (args) => {
      const [xs, ys] = expectPairedSamples(args, 'rsquared');
      const fitted = stats.leastSquares(xs, ys);
      if (fitted === null) {
        throw new ExpressionError('Every x is the same here, so there is no line to score');
      }
      const score = stats.coefficientOfDetermination(xs, ys, fitted);
      if (score === null) {
        throw new ExpressionError('Every y is the same here, so there is no variation to account for');
      }
      return number(score);
    },
    'Statistics',
  ),

  // Reading a line back, which is what makes fit() more than a picture.
  define('slope', 'slope(l)', 'Slope of a line, ray or segment', 1, 1, (args) => {
    const target = expectLine(args, 0, 'slope');
    const run = target.to.x - target.from.x;
    if (run === 0) {
      throw new ExpressionError('This line is vertical, so it has no slope');
    }
    return number((target.to.y - target.from.y) / run);
  }),

  define('intercept', 'intercept(l)', 'Where a line crosses the y axis', 1, 1, (args) => {
    const target = expectLine(args, 0, 'intercept');
    const run = target.to.x - target.from.x;
    if (run === 0) {
      throw new ExpressionError('This line is vertical, so it crosses the y axis nowhere or everywhere');
    }
    const gradient = (target.to.y - target.from.y) / run;
    return number(target.from.y - gradient * target.from.x);
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
