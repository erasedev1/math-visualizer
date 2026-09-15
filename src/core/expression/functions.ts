/**
 * Registry of built-in constants and numeric functions.
 *
 * Everything the evaluator can call lives here, which keeps the parser and the
 * compiler free of per-function special cases and makes the set extensible:
 * later milestones add entries (or a user-defined layer) instead of editing
 * `switch` statements.
 */

export interface FunctionDefinition {
  readonly name: string;
  /** Inclusive arity range. */
  readonly minArgs: number;
  readonly maxArgs: number;
  readonly apply: (args: readonly number[]) => number;
  readonly signature: string;
  readonly description: string;
}

export type FunctionRegistry = ReadonlyMap<string, FunctionDefinition>;

function fn(
  name: string,
  signature: string,
  description: string,
  minArgs: number,
  maxArgs: number,
  apply: (args: readonly number[]) => number,
): FunctionDefinition {
  return { name, signature, description, minArgs, maxArgs, apply };
}

/** Single-argument helper. */
function fn1(
  name: string,
  description: string,
  apply: (x: number) => number,
): FunctionDefinition {
  return fn(name, `${name}(x)`, description, 1, 1, (args) => apply(args[0]!));
}

/** Two-argument helper. */
function fn2(
  name: string,
  signature: string,
  description: string,
  apply: (a: number, b: number) => number,
): FunctionDefinition {
  return fn(name, signature, description, 2, 2, (args) => apply(args[0]!, args[1]!));
}

const DEFINITIONS: readonly FunctionDefinition[] = [
  // Trigonometry (radians).
  fn1('sin', 'Sine, in radians', Math.sin),
  fn1('cos', 'Cosine, in radians', Math.cos),
  fn1('tan', 'Tangent, in radians', Math.tan),
  fn1('sec', 'Secant, 1/cos(x)', (x) => 1 / Math.cos(x)),
  fn1('csc', 'Cosecant, 1/sin(x)', (x) => 1 / Math.sin(x)),
  fn1('cot', 'Cotangent, 1/tan(x)', (x) => 1 / Math.tan(x)),
  fn1('asin', 'Inverse sine', Math.asin),
  fn1('acos', 'Inverse cosine', Math.acos),
  fn1('atan', 'Inverse tangent', Math.atan),
  fn2('atan2', 'atan2(y, x)', 'Angle of the point (x, y)', Math.atan2),

  // Hyperbolics.
  fn1('sinh', 'Hyperbolic sine', Math.sinh),
  fn1('cosh', 'Hyperbolic cosine', Math.cosh),
  fn1('tanh', 'Hyperbolic tangent', Math.tanh),
  fn1('asinh', 'Inverse hyperbolic sine', Math.asinh),
  fn1('acosh', 'Inverse hyperbolic cosine', Math.acosh),
  fn1('atanh', 'Inverse hyperbolic tangent', Math.atanh),

  // Exponentials and logarithms.
  fn1('exp', 'e raised to the power x', Math.exp),
  fn1('ln', 'Natural logarithm (base e)', Math.log),
  fn(
    'log',
    'log(x, base?)',
    'Logarithm, base 10 by default',
    1,
    2,
    (args) => (args.length === 1 ? Math.log10(args[0]!) : Math.log(args[0]!) / Math.log(args[1]!)),
  ),
  fn1('log2', 'Base-2 logarithm', Math.log2),
  fn1('log10', 'Base-10 logarithm', Math.log10),
  fn1('sqrt', 'Square root', Math.sqrt),
  fn1('cbrt', 'Cube root', Math.cbrt),
  fn2('nthroot', 'nthroot(x, n)', 'The n-th root of x', (x, n) =>
    x < 0 && Math.abs(n % 2) === 1 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n),
  ),
  fn2('pow', 'pow(x, y)', 'x raised to the power y', Math.pow),

  // Rounding, sign and magnitude.
  fn1('abs', 'Absolute value', Math.abs),
  fn1('sign', 'Sign of x: -1, 0 or 1', Math.sign),
  fn1('floor', 'Largest integer <= x', Math.floor),
  fn1('ceil', 'Smallest integer >= x', Math.ceil),
  fn1('round', 'Nearest integer', Math.round),
  fn1('trunc', 'Integer part of x', Math.trunc),
  fn1('fract', 'Fractional part of x', (x) => x - Math.floor(x)),
  fn2('mod', 'mod(a, b)', 'Remainder of a/b, with the sign of b', (a, b) => a - b * Math.floor(a / b)),

  // Variadic helpers.
  fn('min', 'min(a, b, ...)', 'Smallest argument', 1, Infinity, (args) => Math.min(...args)),
  fn('max', 'max(a, b, ...)', 'Largest argument', 1, Infinity, (args) => Math.max(...args)),
  fn('hypot', 'hypot(a, b, ...)', 'Euclidean norm of the arguments', 1, Infinity, (args) =>
    Math.hypot(...args),
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
