import { binary, num, unary, type BinaryOperator, type Expr } from '../expression/ast';

/**
 * Algebraic tidying for machine-built expressions.
 *
 * Differentiation produces correct but unreadable trees: the power rule alone
 * turns `x^2` into `2 * x^(2 - 1) * 1`. Nothing downstream needs the tidying —
 * the compiler folds constants on its own — so this exists for the reader, and
 * is deliberately shallow: identities, constant folding and sign handling, but
 * no factoring, no expansion and no term collection. A full computer algebra
 * system is a different project, and a half-finished one would be worse than
 * an honest `2x`.
 *
 * `ln(10)` and other constant calls are left alone: `1/(x ln(10))` says what it
 * means, and `0.434294481903x` does not.
 */
export function simplify(expr: Expr): Expr {
  switch (expr.type) {
    case 'Number':
    case 'Identifier':
      return expr;

    case 'Unary':
      return simplifyUnary(expr.operator, simplify(expr.argument));

    case 'Binary':
      return simplifyBinary(expr.operator, simplify(expr.left), simplify(expr.right), expr.implicit);

    case 'Call':
      return { ...expr, args: expr.args.map(simplify) };

    case 'Tuple':
    case 'Vector':
    case 'List':
      return { ...expr, elements: expr.elements.map(simplify) };
  }
}

/** The number an expression certainly is, or null when it is not a literal. */
export function literalOf(expr: Expr): number | null {
  if (expr.type === 'Number') return expr.value;
  if (expr.type === 'Unary' && expr.argument.type === 'Number') {
    return expr.operator === '-' ? -expr.argument.value : expr.argument.value;
  }
  return null;
}

export function isZero(expr: Expr): boolean {
  return literalOf(expr) === 0;
}

export function isOne(expr: Expr): boolean {
  return literalOf(expr) === 1;
}

const ZERO = num(0);
const ONE = num(1);

function simplifyUnary(operator: '+' | '-', argument: Expr): Expr {
  if (operator === '+') return argument;
  const literal = literalOf(argument);
  if (literal !== null) return num(-literal);
  // Two minus signs cancel: `-(-sin(x))` is `sin(x)`.
  if (argument.type === 'Unary' && argument.operator === '-') return argument.argument;
  // A sign in front of a coefficient belongs to the coefficient: `-2x sin(x)`
  // rather than `-(2x sin(x))`, which is the same product with a bracket to
  // read past.
  const signed = negateCoefficient(argument);
  if (signed !== null) return signed;
  return unary('-', argument);
}

/**
 * Moves a minus sign into a product's numeric coefficient, which normalisation
 * has already placed at the front of the left-associated chain of factors.
 */
function negateCoefficient(expr: Expr): Expr | null {
  if (expr.type === 'Number') return num(-expr.value);
  if (expr.type !== 'Binary' || expr.operator !== '*') return null;
  const left = negateCoefficient(expr.left);
  return left === null ? null : binary('*', left, expr.right, expr.implicit);
}

function simplifyBinary(
  operator: BinaryOperator,
  left: Expr,
  right: Expr,
  implicit: boolean,
): Expr {
  const folded = fold(operator, literalOf(left), literalOf(right));
  if (folded !== null) return num(folded);

  switch (operator) {
    case '+':
      if (isZero(left)) return right;
      if (isZero(right)) return left;
      // `x + -1` reads as `x - 1`, and `sin(x) + -cos(x)` likewise.
      if (right.type === 'Unary' && right.operator === '-') {
        return binary('-', left, right.argument);
      }
      if (right.type === 'Number' && right.value < 0) return binary('-', left, num(-right.value));
      return binary('+', left, right);

    case '-':
      if (isZero(right)) return left;
      if (isZero(left)) return simplifyUnary('-', right);
      if (right.type === 'Unary' && right.operator === '-') {
        return simplifyBinary('+', left, right.argument, false);
      }
      // Subtracting a negative literal adds it: `x - -3` is `x + 3`.
      if (right.type === 'Number' && right.value < 0) return binary('+', left, num(-right.value));
      return binary('-', left, right);

    case '*':
      return simplifyProduct(left, right, implicit);

    case '/':
      if (isOne(right)) return left;
      if (isZero(left)) return ZERO;
      return binary('/', left, right);

    case '^':
      if (isZero(right)) return ONE;
      if (isOne(right)) return left;
      if (isOne(left)) return ONE;
      return binary('^', left, right);
  }
}

/**
 * Products carry most of the noise, because the chain rule multiplies by a
 * derivative that is usually 1.
 *
 * What survives is normalised: signs move outward, factors associate to the
 * left, and a numeric coefficient gathers at the front. That is not cosmetic —
 * `a * (2 * x)` has to be printed `a(2x)`, which reads as a function call,
 * while the same product as `(2 * a) * x` prints `2a x`.
 */
function simplifyProduct(left: Expr, right: Expr, implicit: boolean): Expr {
  // Folded here as well as in `simplifyBinary`, because reassociating brings
  // two numbers together that were not adjacent in the original tree.
  const folded = fold('*', literalOf(left), literalOf(right));
  if (folded !== null) return num(folded);

  if (isZero(left) || isZero(right)) return ZERO;
  if (isOne(left)) return right;
  if (isOne(right)) return left;

  // A sign is read once, at the front, rather than in the middle of a product.
  if (left.type === 'Unary' && left.operator === '-') {
    return simplifyUnary('-', simplifyProduct(left.argument, right, implicit));
  }
  if (right.type === 'Unary' && right.operator === '-') {
    return simplifyUnary('-', simplifyProduct(left, right.argument, implicit));
  }
  if (literalOf(left) === -1) return simplifyUnary('-', right);
  if (literalOf(right) === -1) return simplifyUnary('-', left);

  // Left-associate, which is also what gathers `2 * (3 * x)` into `6x`.
  if (right.type === 'Binary' && right.operator === '*') {
    return simplifyProduct(simplifyProduct(left, right.left, implicit), right.right, implicit);
  }

  // A number belongs in front of what it scales.
  if (left.type !== 'Number' && right.type === 'Number') {
    return simplifyProduct(right, left, implicit);
  }

  // Juxtaposition prints as `2x` and `x cos(x)`, which is how the same product
  // would be written by hand; the printer decides where a space is needed.
  return binary('*', left, right, true);
}

/**
 * Arithmetic on two literals, when the result is worth writing down. A third
 * of something stays `1/3`, because `0.333333333333` is not an improvement.
 */
function fold(operator: BinaryOperator, left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;

  switch (operator) {
    case '+':
      return finite(left + right);
    case '-':
      return finite(left - right);
    case '*':
      return finite(left * right);
    case '/': {
      const quotient = left / right;
      return Number.isInteger(quotient) ? finite(quotient) : null;
    }
    case '^': {
      const power = Math.pow(left, right);
      return Number.isInteger(left) && Number.isInteger(right) && right >= 0
        ? finite(power)
        : null;
    }
  }
}

function finite(value: number): number | null {
  return Number.isFinite(value) && Math.abs(value) < 1e15 ? value : null;
}
