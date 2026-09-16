import { binary, call, id, num, unary, type Expr } from '../expression/ast';
import { ExpressionError } from '../expression/errors';
import {
  BUILTIN_FUNCTIONS,
  powerRule,
  type DerivativeRule,
  type FunctionRegistry,
} from '../expression/functions';
import { isZero, simplify } from './simplify';

/**
 * Symbolic differentiation.
 *
 * The result is an expression, not a number, so it can be compiled, plotted,
 * differentiated again and read back as text. That is the reason to do this
 * symbolically rather than with a difference quotient: a numeric derivative
 * would give a slope at a point, while `f'` is a function of its own.
 *
 * Only the rules of the calculus live here. Which expression is the derivative
 * of `sin` is the registry's business (`core/expression/functions.ts`), and a
 * function the workspace defines supplies its rule the same way, so `f'`, `g'`
 * and `sin'` are one mechanism rather than three.
 */

export interface DeriveOptions {
  readonly functions?: FunctionRegistry;
}

const ZERO = num(0);
const ONE = num(1);

/**
 * d/d`variable` of an expression, simplified.
 *
 * Every name other than `variable` is treated as a constant, which is what
 * makes this a partial derivative and what the workspace wants: in
 * `f(x) = a x^2` the parameter `a` does not vary with x.
 */
export function derive(expr: Expr, variable: string, options: DeriveOptions = {}): Expr {
  const functions = options.functions ?? BUILTIN_FUNCTIONS;

  // Each case returns an already-simplified expression, so the tree stays
  // small as the rules compose rather than blowing up and being tidied once.
  const d = (node: Expr): Expr => {
    switch (node.type) {
      case 'Number':
        return ZERO;

      case 'Identifier':
        return node.name === variable ? ONE : ZERO;

      case 'Unary':
        return node.operator === '+' ? d(node.argument) : simplify(unary('-', d(node.argument)));

      case 'Binary': {
        const { left, right } = node;
        switch (node.operator) {
          case '+':
          case '-':
            return simplify(binary(node.operator, d(left), d(right)));

          case '*': {
            const dLeft = d(left);
            const dRight = d(right);
            return simplify(
              binary(
                '+',
                binary('*', dLeft, right, true),
                binary('*', left, dRight, true),
              ),
            );
          }

          case '/': {
            const dLeft = d(left);
            const dRight = d(right);
            // A constant denominator is the common case, and dividing by it is
            // all it needs: the quotient rule would give the equal but
            // unreadable `2/4` for the derivative of `x/2`.
            if (isZero(dRight)) return simplify(binary('/', dLeft, right));
            return simplify(
              binary(
                '/',
                binary(
                  '-',
                  binary('*', dLeft, right, true),
                  binary('*', left, dRight, true),
                ),
                binary('^', right, num(2)),
              ),
            );
          }

          case '^':
            return simplify(powerRule(left, right, d(left), d(right)));
        }
      }

      case 'Call': {
        const definition = functions.get(node.callee);
        if (definition === undefined) {
          throw new ExpressionError(`Unknown function "${node.callee}"`);
        }
        const derivatives = node.args.map(d);
        // A call whose arguments are all constant is itself constant, so
        // `x + floor(3)` differentiates even though `floor` does not.
        if (derivatives.every(isZero)) return ZERO;
        if (definition.derivative === undefined) {
          throw new ExpressionError(`${node.callee} has no derivative`);
        }
        return simplify(definition.derivative(node.args, derivatives));
      }

      case 'Tuple':
      case 'Vector':
      case 'List':
        throw new ExpressionError(`${describeShape(node.type)} cannot be differentiated`);
    }
  };

  return d(expr);
}

/** Differentiates `order` times over. */
export function deriveRepeatedly(
  expr: Expr,
  variable: string,
  order: number,
  options: DeriveOptions = {},
): Expr {
  let result = expr;
  for (let i = 0; i < order; i += 1) result = derive(result, variable, options);
  return result;
}

/**
 * The derivative rule for a function the workspace defines.
 *
 * `g(u1, ..., un)` differentiates by the full chain rule: the partial
 * derivative with respect to each parameter, with the arguments written in the
 * parameters' place, times that argument's own derivative. Substituting all
 * parameters at once matters — replacing them one after another would let an
 * argument mentioning `x` be caught by a later parameter also named `x`.
 */
export function definedFunctionRule(
  params: readonly string[],
  body: Expr,
  functions: FunctionRegistry,
): DerivativeRule {
  return (args, derivatives) => {
    const terms: Expr[] = [];
    params.forEach((param, index) => {
      const outer = derivatives[index];
      if (outer === undefined || isZero(outer)) return;
      const partial = substitute(derive(body, param, { functions }), bind(params, args));
      terms.push(binary('*', partial, outer, true));
    });
    if (terms.length === 0) return ZERO;
    return terms.reduce((left, right) => binary('+', left, right));
  };
}

/**
 * The body of the `order`-th derivative of a named one-argument function.
 *
 * Written as the derivative of `name(variable)` so that the registry's own
 * rule does the work, which is why a built-in and a defined function need no
 * separate treatment.
 */
export function deriveNamedFunction(
  name: string,
  variable: string,
  order: number,
  functions: FunctionRegistry,
): Expr {
  return deriveRepeatedly(call(name, [id(variable)]), variable, order, { functions });
}

/** Replaces free identifiers, all at once. */
export function substitute(expr: Expr, bindings: ReadonlyMap<string, Expr>): Expr {
  if (bindings.size === 0) return expr;

  const replace = (node: Expr): Expr => {
    switch (node.type) {
      case 'Number':
        return node;
      case 'Identifier':
        return bindings.get(node.name) ?? node;
      case 'Unary':
        return { ...node, argument: replace(node.argument) };
      case 'Binary':
        return { ...node, left: replace(node.left), right: replace(node.right) };
      case 'Call':
        return { ...node, args: node.args.map(replace) };
      case 'Tuple':
      case 'Vector':
      case 'List':
        return { ...node, elements: node.elements.map(replace) };
    }
  };

  return replace(expr);
}

function bind(params: readonly string[], args: readonly Expr[]): Map<string, Expr> {
  const bindings = new Map<string, Expr>();
  params.forEach((param, index) => {
    const argument = args[index];
    if (argument !== undefined) bindings.set(param, argument);
  });
  return bindings;
}

function describeShape(type: 'Tuple' | 'Vector' | 'List'): string {
  switch (type) {
    case 'Tuple':
      return 'A point';
    case 'Vector':
      return 'A vector';
    case 'List':
      return 'A matrix';
  }
}
