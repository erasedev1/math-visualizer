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
import { number, point, withArticle, type Value } from './types';

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

      case 'Unary': {
        const inner = evaluate(expr.argument);
        if (expr.operator === '+') return inner;
        if (inner.kind === 'number') return number(-inner.value);
        if (inner.kind === 'point') return point(-inner.x, -inner.y);
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
    if (left.kind === 'point' && right.kind === 'point') {
      const sign = operator === '+' ? 1 : -1;
      return point(left.x + sign * right.x, left.y + sign * right.y);
    }
  }

  if (operator === '*') {
    if (left.kind === 'number' && right.kind === 'point') {
      return point(left.value * right.x, left.value * right.y);
    }
    if (left.kind === 'point' && right.kind === 'number') {
      return point(left.x * right.value, left.y * right.value);
    }
  }

  if (operator === '/' && left.kind === 'point' && right.kind === 'number') {
    return point(left.x / right.value, left.y / right.value);
  }

  throw new ExpressionError(
    `Cannot ${verb(operator)} ${withArticle(left.kind)} and ${withArticle(right.kind)}`,
  );
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
