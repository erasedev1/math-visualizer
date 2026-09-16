import {
  findExtremum,
  findRoot,
  integrate,
  type UnaryFunction,
} from '../calculus/numeric';
import { binary, call, num, unary, type Expr } from './ast';
import { ExpressionError } from './errors';

/**
 * Registry of built-in constants and numeric functions.
 *
 * Everything the evaluator can call lives here, which keeps the parser and the
 * compiler free of per-function special cases and makes the set extensible:
 * later milestones add entries (or a user-defined layer) instead of editing
 * `switch` statements.
 *
 * Each function also declares how to differentiate itself, for the same
 * reason. `core/calculus/derive.ts` knows the rules of the calculus — sums,
 * products, quotients, powers and the chain rule — but nothing about `sin`;
 * adding `erf` means adding one line here, not editing a differentiator.
 *
 * A few entries take a function rather than a number as their first argument.
 * They live here with everything else, so the parser, the compiler, the value
 * evaluator and the on-screen reference find them where they find `sin`; the
 * numerical methods they call are in `core/calculus/numeric.ts`, which knows
 * nothing about expressions.
 */

/**
 * d/dx of `name(a1, ..., an)`, given the argument expressions and their
 * derivatives. The rule applies the chain rule itself, because only the rule
 * knows which arguments the result depends on.
 */
export type DerivativeRule = (
  args: readonly Expr[],
  derivatives: readonly Expr[],
) => Expr;

export interface FunctionDefinition {
  readonly name: string;
  /** Inclusive arity range. */
  readonly minArgs: number;
  readonly maxArgs: number;
  readonly apply: (args: readonly number[]) => number;
  readonly signature: string;
  readonly description: string;
  /** Absent when the function has no derivative, as `floor` does not. */
  readonly derivative?: DerivativeRule | undefined;
  /**
   * Set on a function whose first argument is another function written by
   * name, as in `integral(f, 0, 1)`. The name is resolved where the call is
   * compiled rather than where it is applied, so plotting one of these stays
   * on the unboxed numeric path and the value domain needs no function kind.
   */
  readonly higherOrder?: HigherOrderApplication | undefined;
}

/** Applies a higher-order function to the resolved function and the rest. */
export type HigherOrderApplication = (
  target: UnaryFunction,
  args: readonly number[],
) => number;

export type FunctionRegistry = ReadonlyMap<string, FunctionDefinition>;

// Builders for derivative rules. Products are marked implicit so that the
// printer renders `2x` and `x cos(x)` rather than `2 * x`.
const times = (a: Expr, b: Expr): Expr => binary('*', a, b, true);
const over = (a: Expr, b: Expr): Expr => binary('/', a, b);
const plus = (a: Expr, b: Expr): Expr => binary('+', a, b);
const minus = (a: Expr, b: Expr): Expr => binary('-', a, b);
const raise = (a: Expr, b: Expr): Expr => binary('^', a, b);
const negated = (a: Expr): Expr => unary('-', a);
const ONE = num(1);
const TWO = num(2);

/** Wraps d/du into the chain rule for a one-argument function. */
function chain(slope: (u: Expr) => Expr): DerivativeRule {
  return (args, derivatives) => times(slope(args[0]!), derivatives[0]!);
}

/** True when a derivative has already reduced to a literal zero. */
function isConstant(derivative: Expr | undefined): boolean {
  return derivative?.type === 'Number' && derivative.value === 0;
}

/**
 * d/dx of `base^exponent`, the one rule shared by the `^` operator and `pow`.
 *
 * Written as the sum of the two partial derivatives — the power rule in the
 * base plus exponential growth in the exponent — so that `x^2`, `2^x` and
 * `x^x` are one formula. The familiar `u^v (v' ln u + v u'/u)` is the same
 * thing with `u^v` factored out, but it divides by the base, which would
 * report a singularity at `x = 0` for something as ordinary as `x^2`. Whichever
 * term does not apply has a zero derivative in it and simplifies away.
 */
export function powerRule(
  base: Expr,
  exponent: Expr,
  dBase: Expr,
  dExponent: Expr,
): Expr {
  return plus(
    times(times(exponent, raise(base, minus(exponent, ONE))), dBase),
    times(times(raise(base, exponent), call('ln', [base])), dExponent),
  );
}

/**
 * A function whose first argument is another function.
 *
 * `apply` is unreachable — every path that can call one of these resolves the
 * function argument first — but saying so out loud beats a cast, and the
 * message is the right one if a later path forgets.
 */
function higher(
  name: string,
  signature: string,
  description: string,
  higherOrder: HigherOrderApplication,
  derivative?: DerivativeRule,
): FunctionDefinition {
  return {
    name,
    signature,
    description,
    minArgs: 3,
    maxArgs: 3,
    higherOrder,
    derivative,
    apply: () => {
      throw new ExpressionError(`${name} takes a function as its first argument`);
    },
  };
}

/**
 * Resolves the name in a higher-order call to something callable.
 *
 * It has to be a name: `integral(f, 0, 1)` reads `f` itself, where
 * `integral(f(x), 0, 1)` would ask for a number that has no value yet. Saying
 * which of the two was written is most of the help this can give.
 */
export function resolveFunctionArgument(
  node: Expr | undefined,
  functions: FunctionRegistry,
  callee: string,
): UnaryFunction {
  if (node === undefined || node.type !== 'Identifier') {
    const written = node?.type === 'Call' ? `; write ${node.callee}, not ${node.callee}(...)` : '';
    throw new ExpressionError(
      `${callee} takes a function as its first argument, written by name${written}`,
    );
  }

  const definition = functions.get(node.name);
  if (definition === undefined) {
    throw new ExpressionError(
      `${callee} takes a function as its first argument, and "${node.name}" is not a function`,
    );
  }
  if (definition.higherOrder !== undefined) {
    throw new ExpressionError(
      `${node.name} takes a function of its own, so it cannot be passed to ${callee}`,
    );
  }
  if (definition.minArgs > 1 || definition.maxArgs < 1) {
    throw new ExpressionError(
      `${callee} takes a function of one variable, and ${arityMessage(definition)}`,
    );
  }

  const { apply } = definition;
  return (x) => apply([x]);
}

function fn(
  name: string,
  signature: string,
  description: string,
  minArgs: number,
  maxArgs: number,
  apply: (args: readonly number[]) => number,
  derivative?: DerivativeRule,
): FunctionDefinition {
  return { name, signature, description, minArgs, maxArgs, apply, derivative };
}

/** Single-argument helper. `slope` is d/du, which `chain` completes. */
function fn1(
  name: string,
  description: string,
  apply: (x: number) => number,
  slope?: (u: Expr) => Expr,
): FunctionDefinition {
  return fn(
    name,
    `${name}(x)`,
    description,
    1,
    1,
    (args) => apply(args[0]!),
    slope === undefined ? undefined : chain(slope),
  );
}

/** Two-argument helper. */
function fn2(
  name: string,
  signature: string,
  description: string,
  apply: (a: number, b: number) => number,
  derivative?: DerivativeRule,
): FunctionDefinition {
  return fn(
    name,
    signature,
    description,
    2,
    2,
    (args) => apply(args[0]!, args[1]!),
    derivative,
  );
}

const DEFINITIONS: readonly FunctionDefinition[] = [
  // Trigonometry (radians).
  fn1('sin', 'Sine, in radians', Math.sin, (u) => call('cos', [u])),
  fn1('cos', 'Cosine, in radians', Math.cos, (u) => negated(call('sin', [u]))),
  fn1('tan', 'Tangent, in radians', Math.tan, (u) => raise(call('sec', [u]), TWO)),
  fn1('sec', 'Secant, 1/cos(x)', (x) => 1 / Math.cos(x), (u) =>
    times(call('sec', [u]), call('tan', [u])),
  ),
  fn1('csc', 'Cosecant, 1/sin(x)', (x) => 1 / Math.sin(x), (u) =>
    negated(times(call('csc', [u]), call('cot', [u]))),
  ),
  fn1('cot', 'Cotangent, 1/tan(x)', (x) => 1 / Math.tan(x), (u) =>
    negated(raise(call('csc', [u]), TWO)),
  ),
  fn1('asin', 'Inverse sine', Math.asin, (u) =>
    over(ONE, call('sqrt', [minus(ONE, raise(u, TWO))])),
  ),
  fn1('acos', 'Inverse cosine', Math.acos, (u) =>
    negated(over(ONE, call('sqrt', [minus(ONE, raise(u, TWO))]))),
  ),
  fn1('atan', 'Inverse tangent', Math.atan, (u) => over(ONE, plus(ONE, raise(u, TWO)))),
  fn2(
    'atan2',
    'atan2(y, x)',
    'Angle of the point (x, y)',
    Math.atan2,
    // d/dt atan2(y, x) = (x y' - y x') / (x^2 + y^2).
    (args, d) => {
      const [y, x] = args as [Expr, Expr];
      const [dy, dx] = d as [Expr, Expr];
      return over(
        minus(times(x, dy), times(y, dx)),
        plus(raise(x, TWO), raise(y, TWO)),
      );
    },
  ),

  // Hyperbolics.
  fn1('sinh', 'Hyperbolic sine', Math.sinh, (u) => call('cosh', [u])),
  fn1('cosh', 'Hyperbolic cosine', Math.cosh, (u) => call('sinh', [u])),
  fn1('tanh', 'Hyperbolic tangent', Math.tanh, (u) =>
    minus(ONE, raise(call('tanh', [u]), TWO)),
  ),
  fn1('asinh', 'Inverse hyperbolic sine', Math.asinh, (u) =>
    over(ONE, call('sqrt', [plus(raise(u, TWO), ONE)])),
  ),
  fn1('acosh', 'Inverse hyperbolic cosine', Math.acosh, (u) =>
    over(ONE, call('sqrt', [minus(raise(u, TWO), ONE)])),
  ),
  fn1('atanh', 'Inverse hyperbolic tangent', Math.atanh, (u) =>
    over(ONE, minus(ONE, raise(u, TWO))),
  ),

  // Exponentials and logarithms.
  fn1('exp', 'e raised to the power x', Math.exp, (u) => call('exp', [u])),
  fn1('ln', 'Natural logarithm (base e)', Math.log, (u) => over(ONE, u)),
  fn(
    'log',
    'log(x, base?)',
    'Logarithm, base 10 by default',
    1,
    2,
    (args) => (args.length === 1 ? Math.log10(args[0]!) : Math.log(args[0]!) / Math.log(args[1]!)),
    // log(x, b) = ln(x)/ln(b), so a base that varies makes both terms matter;
    // that is a quotient the writer can differentiate explicitly.
    (args, d) => {
      const [u, base] = args as [Expr, Expr | undefined];
      if (base !== undefined && !isConstant(d[1])) {
        throw new ExpressionError('log has no derivative when its base varies');
      }
      return over(d[0]!, times(u, call('ln', [base ?? num(10)])));
    },
  ),
  fn1('log2', 'Base-2 logarithm', Math.log2, (u) => over(ONE, times(u, call('ln', [TWO])))),
  fn1('log10', 'Base-10 logarithm', Math.log10, (u) =>
    over(ONE, times(u, call('ln', [num(10)]))),
  ),
  fn1('sqrt', 'Square root', Math.sqrt, (u) => over(ONE, times(TWO, call('sqrt', [u])))),
  fn1('cbrt', 'Cube root', Math.cbrt, (u) =>
    over(ONE, times(num(3), raise(call('cbrt', [u]), TWO))),
  ),
  fn2(
    'nthroot',
    'nthroot(x, n)',
    'The n-th root of x',
    (x, n) => (x < 0 && Math.abs(n % 2) === 1 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n)),
    (args, d) => {
      const [u, n] = args as [Expr, Expr];
      if (!isConstant(d[1])) {
        throw new ExpressionError('nthroot has no derivative when n varies');
      }
      return over(d[0]!, times(n, raise(call('nthroot', [u, n]), minus(n, ONE))));
    },
  ),
  fn2('pow', 'pow(x, y)', 'x raised to the power y', Math.pow, (args, d) =>
    powerRule(args[0]!, args[1]!, d[0]!, d[1]!),
  ),

  // Rounding, sign and magnitude. A step function has a derivative of zero
  // between its jumps and none at them, so rather than report zero and be
  // wrong exactly where it matters, these decline to be differentiated.
  fn1('abs', 'Absolute value', Math.abs, (u) => call('sign', [u])),
  fn1('sign', 'Sign of x: -1, 0 or 1', Math.sign),
  fn1('floor', 'Largest integer <= x', Math.floor),
  fn1('ceil', 'Smallest integer >= x', Math.ceil),
  fn1('round', 'Nearest integer', Math.round),
  fn1('trunc', 'Integer part of x', Math.trunc),
  fn1('fract', 'Fractional part of x', (x) => x - Math.floor(x)),
  fn2('mod', 'mod(a, b)', 'Remainder of a/b, with the sign of b', (a, b) => a - b * Math.floor(a / b)),

  // Calculus. These take a function by name and numbers after it; the methods
  // themselves are in core/calculus/numeric.ts.
  higher(
    'integral',
    'integral(f, a, b)',
    'The definite integral of f from a to b',
    (target, args) => integrate(target, args[0]!, args[1]!),
    // The fundamental theorem, in the form that also covers a moving lower
    // limit: d/dt of the integral is f at the top times how the top moves,
    // less f at the bottom times how the bottom moves.
    (args, d) => {
      const target = args[0];
      if (target?.type !== 'Identifier') {
        throw new ExpressionError('integral takes a function as its first argument');
      }
      return minus(
        times(call(target.name, [args[2]!]), d[2]!),
        times(call(target.name, [args[1]!]), d[1]!),
      );
    },
  ),
  higher(
    'root',
    'root(f, a, b)',
    'Where f is zero between a and b, which must bracket a sign change',
    (target, args) => findRoot(target, args[0]!, args[1]!),
  ),
  higher(
    'minimum',
    'minimum(f, a, b)',
    'The least value f takes between a and b',
    (target, args) => findExtremum(target, args[0]!, args[1]!, 'minimum').value,
  ),
  higher(
    'maximum',
    'maximum(f, a, b)',
    'The greatest value f takes between a and b',
    (target, args) => findExtremum(target, args[0]!, args[1]!, 'maximum').value,
  ),
  higher(
    'argmin',
    'argmin(f, a, b)',
    'Where f is least between a and b',
    (target, args) => findExtremum(target, args[0]!, args[1]!, 'minimum').x,
  ),
  higher(
    'argmax',
    'argmax(f, a, b)',
    'Where f is greatest between a and b',
    (target, args) => findExtremum(target, args[0]!, args[1]!, 'maximum').x,
  ),

  // Variadic helpers.
  fn('min', 'min(a, b, ...)', 'Smallest argument', 1, Infinity, (args) => Math.min(...args)),
  fn('max', 'max(a, b, ...)', 'Largest argument', 1, Infinity, (args) => Math.max(...args)),
  fn(
    'hypot',
    'hypot(a, b, ...)',
    'Euclidean norm of the arguments',
    1,
    Infinity,
    (args) => Math.hypot(...args),
    // d/dt |u| = (u . u') / |u|.
    (args, d) => {
      const terms = args.map((argument, index) => times(argument, d[index]!));
      return over(terms.reduce(plus), call('hypot', args));
    },
  ),
];

export const BUILTIN_FUNCTIONS: FunctionRegistry = new Map(
  DEFINITIONS.map((definition) => [definition.name, definition]),
);

export const BUILTIN_FUNCTION_LIST: readonly FunctionDefinition[] = DEFINITIONS;

/** Golden ratio, provided for convenience alongside pi/tau/e. */
const PHI = (1 + Math.sqrt(5)) / 2;

export const BUILTIN_CONSTANTS: Readonly<Record<string, number>> = Object.freeze({
  pi: Math.PI,
  'π': Math.PI,
  tau: 2 * Math.PI,
  'τ': 2 * Math.PI,
  e: Math.E,
  phi: PHI,
  'φ': PHI,
  infinity: Infinity,
});

export function arityMessage(definition: FunctionDefinition): string {
  const { minArgs, maxArgs } = definition;
  if (minArgs === maxArgs) {
    return `${definition.name} takes ${minArgs} argument${minArgs === 1 ? '' : 's'}`;
  }
  if (maxArgs === Infinity) {
    return `${definition.name} takes at least ${minArgs} argument${minArgs === 1 ? '' : 's'}`;
  }
  return `${definition.name} takes between ${minArgs} and ${maxArgs} arguments`;
}
