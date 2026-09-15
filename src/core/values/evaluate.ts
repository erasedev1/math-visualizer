import type { BinaryOperator, Expr } from '../expression/ast';
import { ExpressionError } from '../expression/errors';
import {
  arityMessage,
  BUILTIN_CONSTANTS,
  BUILTIN_FUNCTIONS,
  type FunctionRegistry,
} from '../expression/functions';
import {
  valueArityMessage,
  VALUE_FUNCTIONS,
  type ValueFunctionRegistry,
} from './functions';
import * as linear from './matrix';
import {
  matrix,
  number,
  point,
  vector,
  withArticle,
  type MatrixValue,
  type Value,
  type VectorValue,
} from './types';

/**
 * Evaluates an expression to a value.
 *
 * This is a tree walk, not a compiler, and that is deliberate: workspace
 * values are computed once per change, while curves are sampled thousands of
 * times per frame and stay on the compiled numeric path. Keeping the two
 * separate means neither pays for the other.
 */

export interface ValueScope {
  /** Names bound to values, including other workspace items. */
  readonly values?: ReadonlyMap<string, Value>;
  /** Numeric constants such as pi, used when a name is not a value. */
  readonly constants?: Readonly<Record<string, number>>;
  readonly functions?: FunctionRegistry;
  readonly valueFunctions?: ValueFunctionRegistry;
  /** User-defined functions, which return numbers. */
  readonly callNumeric?: (name: string, args: readonly number[]) => number | undefined;
}

export function evaluateValue(node: Expr, scope: ValueScope = {}): Value {
  const constants = scope.constants ?? BUILTIN_CONSTANTS;
  const values = scope.values;
  const numericFunctions = scope.functions ?? BUILTIN_FUNCTIONS;
  const valueFunctions = scope.valueFunctions ?? VALUE_FUNCTIONS;

  const evaluate = (expr: Expr): Value => {
    switch (expr.type) {
      case 'Number':
        return number(expr.value);

      case 'Identifier': {
        const bound = values?.get(expr.name);
        if (bound !== undefined) return bound;
        if (Object.hasOwn(constants, expr.name)) return number(constants[expr.name]!);
        if (valueFunctions.has(expr.name) || numericFunctions.has(expr.name)) {
          throw new ExpressionError(
            `"${expr.name}" is a function; write ${expr.name}(...) to call it`,
          );
        }
        throw new ExpressionError(`Unknown name "${expr.name}"`);
      }

      case 'Tuple': {
        if (expr.elements.length !== 2) {
          throw new ExpressionError(
            `A point needs two coordinates, but this has ${expr.elements.length}`,
          );
        }
        const [first, second] = expr.elements as [Expr, Expr];
        return point(asNumber(evaluate(first), 'a coordinate'), asNumber(evaluate(second), 'a coordinate'));
      }

      case 'Vector':
        return vector(
          expr.elements.map((element) => asNumber(evaluate(element), 'a vector component')),
        );

      case 'List':
        return buildMatrix(expr.elements.map(evaluate));

      case 'Unary': {
        const inner = evaluate(expr.argument);
        if (expr.operator === '+') return inner;
        if (inner.kind === 'number') return number(-inner.value);
        if (inner.kind === 'point') return point(-inner.x, -inner.y);
        if (inner.kind === 'vector') return vector(inner.components.map((c) => -c), inner.anchor);
        if (inner.kind === 'matrix') return matrix(linear.scale(inner.rows, -1));
        throw new ExpressionError(`Cannot negate ${withArticle(inner.kind)}`);
      }

      case 'Binary':
        return applyBinary(expr.operator, evaluate(expr.left), evaluate(expr.right));

      case 'Call':
        return applyCall(expr.callee, expr.args.map(evaluate));
    }
  };

  const applyCall = (name: string, args: readonly Value[]): Value => {
    const geometric = valueFunctions.get(name);
    if (geometric !== undefined) {
      if (args.length < geometric.minArgs || args.length > geometric.maxArgs) {
        throw new ExpressionError(`${valueArityMessage(geometric)}, but got ${args.length}`);
      }
      return geometric.apply(args);
    }

    const numeric = numericFunctions.get(name);
    if (numeric !== undefined) {
      if (args.length < numeric.minArgs || args.length > numeric.maxArgs) {
        throw new ExpressionError(`${arityMessage(numeric)}, but got ${args.length}`);
      }
      return number(numeric.apply(args.map((arg) => asNumber(arg, `an argument to ${name}`))));
    }

    const user = scope.callNumeric?.(
      name,
      args.map((arg) => asNumber(arg, `an argument to ${name}`)),
    );
    if (user !== undefined) return number(user);

    throw new ExpressionError(`Unknown function "${name}"`);
  };

  return evaluate(node);
}

/**
 * Arithmetic on values.
 *
 * Points add, subtract and scale, so a midpoint can be written `(A + B)/2`
 * as well as `midpoint(A, B)`. Everything else is a type error with a message
 * naming both kinds, rather than a silent NaN.
 */
function applyBinary(operator: BinaryOperator, left: Value, right: Value): Value {
  if (left.kind === 'number' && right.kind === 'number') {
    return number(numericOperator(operator, left.value, right.value));
  }

  if (operator === '+' || operator === '-') {
    const sign = operator === '+' ? 1 : -1;

    // Adding points is componentwise, which is what makes `(A + B)/2` a
    // midpoint. Subtracting them gives the displacement from one to the other,
    // which is a vector rather than a point.
    if (left.kind === 'point' && right.kind === 'point') {
      return operator === '+'
        ? point(left.x + right.x, left.y + right.y)
        : vector([left.x - right.x, left.y - right.y]);
    }

    if (left.kind === 'point' && right.kind === 'vector') {
      const [dx, dy] = planeComponents(right, operator === '+' ? 'add' : 'subtract');
      return point(left.x + sign * dx, left.y + sign * dy);
    }
    if (left.kind === 'vector' && right.kind === 'point' && operator === '+') {
      const [dx, dy] = planeComponents(left, 'add');
      return point(right.x + dx, right.y + dy);
    }

    if (left.kind === 'vector' && right.kind === 'vector') {
      requireSameLength(left, right, operator === '+' ? 'add' : 'subtract');
      return vector(left.components.map((c, i) => c + sign * right.components[i]!));
    }

    if (left.kind === 'matrix' && right.kind === 'matrix') {
      requireSameShape(left, right, operator === '+' ? 'add' : 'subtract');
      return matrix(
        operator === '+' ? linear.add(left.rows, right.rows) : linear.subtract(left.rows, right.rows),
      );
    }
  }

  if (operator === '*') {
    if (left.kind === 'number' && right.kind === 'point') {
      return point(left.value * right.x, left.value * right.y);
    }
    if (left.kind === 'point' && right.kind === 'number') {
      return point(left.x * right.value, left.y * right.value);
    }
    if (left.kind === 'number' && right.kind === 'vector') {
      return vector(right.components.map((c) => left.value * c), right.anchor);
    }
    if (left.kind === 'vector' && right.kind === 'number') {
      return vector(left.components.map((c) => c * right.value), left.anchor);
    }
    if (left.kind === 'number' && right.kind === 'matrix') {
      return matrix(linear.scale(right.rows, left.value));
    }
    if (left.kind === 'matrix' && right.kind === 'number') {
      return matrix(linear.scale(left.rows, right.value));
    }
    if (left.kind === 'matrix' && right.kind === 'matrix') {
      const inner = linear.dimensions(left.rows).columns;
      const outer = linear.dimensions(right.rows).rows;
      if (inner !== outer) {
        throw new ExpressionError(
          `Cannot multiply ${shapeOf(left)} by ${shapeOf(right)}: the first has ${inner} column${
            inner === 1 ? '' : 's'
          } and the second has ${outer} row${outer === 1 ? '' : 's'}`,
        );
      }
      return matrix(linear.multiply(left.rows, right.rows));
    }
    if (left.kind === 'matrix' && right.kind === 'vector') {
      const columns = linear.dimensions(left.rows).columns;
      if (columns !== right.components.length) {
        throw new ExpressionError(
          `Cannot multiply ${shapeOf(left)} by a vector with ${right.components.length} components`,
        );
      }
      return vector(linear.apply(left.rows, right.components));
    }
    if (left.kind === 'vector' && right.kind === 'matrix') {
      const rows = linear.dimensions(right.rows).rows;
      if (rows !== left.components.length) {
        throw new ExpressionError(
          `Cannot multiply a vector with ${left.components.length} components by ${shapeOf(right)}`,
        );
      }
      return vector(linear.apply(linear.transpose(right.rows), left.components));
    }
  }

  if (operator === '/' && right.kind === 'number') {
    if (left.kind === 'point') return point(left.x / right.value, left.y / right.value);
    if (left.kind === 'vector') {
      return vector(left.components.map((c) => c / right.value), left.anchor);
    }
    if (left.kind === 'matrix') return matrix(linear.scale(left.rows, 1 / right.value));
  }

  throw new ExpressionError(
    `Cannot ${verb(operator)} ${withArticle(left.kind)} and ${withArticle(right.kind)}`,
  );
}

/** Builds a matrix from the rows of a `[...]` literal. */
function buildMatrix(elements: readonly Value[]): MatrixValue {
  if (elements.length === 0) {
    throw new ExpressionError('A matrix needs at least one row');
  }

  // A flat list is one row; a list of lists is a matrix of rows.
  const rows = elements.every((element) => element.kind === 'number')
    ? [elements.map((element) => asNumber(element, 'a matrix entry'))]
    : elements.map((element, index) => {
        if (element.kind !== 'matrix') {
          throw new ExpressionError(
            `Row ${index + 1} of this matrix is ${withArticle(element.kind)}, not a row of numbers`,
          );
        }
        if (element.rows.length !== 1) {
          throw new ExpressionError(`Row ${index + 1} of this matrix is itself a matrix`);
        }
        return element.rows[0]!;
      });

  const width = rows[0]!.length;
  const uneven = rows.findIndex((row) => row.length !== width);
  if (uneven >= 0) {
    throw new ExpressionError(
      `Every row must be the same length, but row 1 has ${width} and row ${uneven + 1} has ${rows[uneven]!.length}`,
    );
  }

  return matrix(rows);
}

/**
 * A vector combined with a point has to lie in the plane the point lives in;
 * silently dropping a third component would move the point to the wrong place.
 */
function planeComponents(value: VectorValue, verb: string): [number, number] {
  if (value.components.length !== 2) {
    throw new ExpressionError(
      `Cannot ${verb} a point and a vector with ${value.components.length} components`,
    );
  }
  return [value.components[0]!, value.components[1]!];
}

function shapeOf(value: MatrixValue): string {
  const { rows, columns } = linear.dimensions(value.rows);
  return `a ${rows}\u00d7${columns} matrix`;
}

function requireSameLength(a: VectorValue, b: VectorValue, verb: string): void {
  if (a.components.length !== b.components.length) {
    throw new ExpressionError(
      `Cannot ${verb} vectors with ${a.components.length} and ${b.components.length} components`,
    );
  }
}

function requireSameShape(a: MatrixValue, b: MatrixValue, verb: string): void {
  if (!linear.sameShape(a.rows, b.rows)) {
    throw new ExpressionError(`Cannot ${verb} ${shapeOf(a)} and ${shapeOf(b)}`);
  }
}

function numericOperator(operator: BinaryOperator, a: number, b: number): number {
  switch (operator) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return a / b;
    case '^':
      return Math.pow(a, b);
  }
}

function verb(operator: BinaryOperator): string {
  switch (operator) {
    case '+':
      return 'add';
    case '-':
      return 'subtract';
    case '*':
      return 'multiply';
    case '/':
      return 'divide';
    case '^':
      return 'raise';
  }
}

/** Unwraps a number, naming what was expected when it is not one. */
export function asNumber(value: Value, what: string): number {
  if (value.kind !== 'number') {
    throw new ExpressionError(`Expected a number for ${what}, but got ${withArticle(value.kind)}`);
  }
  return value.value;
}
