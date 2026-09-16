import { describe, expect, it } from 'vitest';
import {
  derive,
  deriveNamedFunction,
  deriveRepeatedly,
  definedFunctionRule,
  substitute,
} from '@/core/calculus/derive';
import { compile } from '@/core/expression/compile';
import {
  BUILTIN_CONSTANTS,
  BUILTIN_FUNCTIONS,
  type FunctionDefinition,
} from '@/core/expression/functions';
import { parseExpression } from '@/core/expression/parser';
import { toSource } from '@/core/expression/print';
import { id, num } from '@/core/expression/ast';

const parse = (source: string) => parseExpression(source);
const d = (source: string, variable = 'x') => toSource(derive(parse(source), variable));

describe('derive', () => {
  it('differentiates the elementary rules', () => {
    expect(d('5')).toBe('0');
    expect(d('x')).toBe('1');
    expect(d('a')).toBe('0');
    expect(d('x + 3')).toBe('1');
    expect(d('2x')).toBe('2');
    expect(d('x^2')).toBe('2x');
    expect(d('x^3')).toBe('3x^2');
    expect(d('3x^3 + 2x - 5')).toBe('9x^2 + 2');
    expect(d('x/2')).toBe('1 / 2');
    expect(d('1/x')).toBe('-1 / x^2');
    expect(d('-x')).toBe('-1');
  });

  it('applies the product and quotient rules', () => {
    expect(d('x sin(x)')).toBe('sin(x) + x cos(x)');
    expect(d('sin(x)/x')).toBe('(cos(x)x - sin(x)) / x^2');
  });

  it('applies the chain rule through nested calls', () => {
    expect(d('sin(2x)')).toBe('2cos(2x)');
    expect(d('cos(x^2)')).toBe('-2sin(x^2)x');
    expect(d('exp(-x^2)')).toBe('-2exp(-x^2)x');
    expect(d('(x + 1)^5')).toBe('5(x + 1)^4');
  });

  it('treats every other name as a constant, which makes it a partial derivative', () => {
    expect(d('a x^2 + b x + c')).toBe('2a x + b');
    expect(d('a x^2', 'a')).toBe('x^2');
    expect(d('x^2', 'y')).toBe('0');
  });

  it('covers all three shapes of a power', () => {
    // A constant exponent, a constant base, and both varying.
    expect(d('x^4')).toBe('4x^3');
    expect(d('2^x')).toBe('2^x ln(2)');
    expect(d('x^x')).toBe('x x^(x - 1) + x^x ln(x)');
    expect(d('pow(x, 3)')).toBe('3x^2');
  });

  it('differentiates a constant call without needing a rule for it', () => {
    // `floor` has no derivative, but `floor(3)` does not vary.
    expect(d('x + floor(3)')).toBe('1');
    expect(d('min(2, 3) x')).toBe('min(2, 3)');
  });

  it('declines to differentiate a step function', () => {
    expect(() => derive(parse('floor(x)'), 'x')).toThrow('floor has no derivative');
    expect(() => derive(parse('round(2x)'), 'x')).toThrow('round has no derivative');
    expect(() => derive(parse('min(x, 1)'), 'x')).toThrow('min has no derivative');
    expect(() => derive(parse('mod(x, 2)'), 'x')).toThrow('mod has no derivative');
  });

  it('declines when a logarithm base or a root order varies', () => {
    expect(d('log(x, 2)')).toBe('1 / (x ln(2))');
    expect(() => derive(parse('log(2, x)'), 'x')).toThrow('base varies');
    expect(d('nthroot(x, 3)')).toBe('1 / (3nthroot(x, 3)^2)');
    expect(() => derive(parse('nthroot(2, x)'), 'x')).toThrow('n varies');
  });

  it('declines to differentiate values that are not numbers', () => {
    expect(() => derive(parse('(x, 2)'), 'x')).toThrow('A point cannot be differentiated');
    expect(() => derive(parse('<x, 2>'), 'x')).toThrow('A vector cannot be differentiated');
    expect(() => derive(parse('[[x, 2]]'), 'x')).toThrow('A matrix cannot be differentiated');
  });

  it('reports an unknown function rather than assuming it is constant', () => {
    // `nope(x)` only reads as a call where `nope` is known to be one; without
    // that it is the product `nope * x`, whose derivative is `nope`.
    expect(d('nope(x)')).toBe('nope');
    const asCall = parseExpression('nope(x)', { isFunction: () => true });
    expect(() => derive(asCall, 'x')).toThrow('Unknown function "nope"');
  });

  it('differentiates repeatedly', () => {
    const fourth = deriveRepeatedly(parse('sin(x)'), 'x', 4);
    expect(toSource(fourth)).toBe('sin(x)');
    expect(toSource(deriveRepeatedly(parse('x^3'), 'x', 2))).toBe('6x');
    expect(toSource(deriveRepeatedly(parse('x^3'), 'x', 4))).toBe('0');
  });
});

/**
 * The printed forms above say the result is readable; these say it is right.
 * A central difference is accurate to about h^2, so agreement to eight digits
 * over a range of points is a real check rather than a restatement of the
 * rules.
 */
describe('derive, checked against a central difference', () => {
  const cases: readonly (readonly [string, readonly number[]])[] = [
    ['x^2 + 3x - 1', [-2, 0.5, 3]],
    ['x^7', [-1.3, 0.2, 1.1]],
    ['1/x', [-2, 0.75, 3]],
    ['sqrt(x)', [0.5, 2, 9]],
    ['cbrt(x)', [0.5, 2, 8]],
    ['nthroot(x, 5)', [0.5, 2, 30]],
    ['sin(x) cos(x)', [-1, 0.3, 2]],
    ['sin(x)/x', [-2, 0.4, 3]],
    ['tan(x)', [-0.5, 0.3, 1]],
    ['sec(x)', [-0.5, 0.3, 1]],
    ['csc(x)', [0.4, 1, 2]],
    ['cot(x)', [0.4, 1, 2]],
    ['asin(x)', [-0.6, 0.1, 0.7]],
    ['acos(x)', [-0.6, 0.1, 0.7]],
    ['atan(x^2)', [-2, 0.3, 4]],
    ['atan2(x, 2x + 1)', [-2, 0.3, 4]],
    ['sinh(x) + cosh(x)', [-1, 0.2, 1.5]],
    ['tanh(3x)', [-1, 0.2, 1.5]],
    ['asinh(x)', [-2, 0.4, 3]],
    ['acosh(x)', [1.4, 2, 6]],
    ['atanh(x)', [-0.7, 0.2, 0.6]],
    ['exp(-x^2/2)', [-2, 0.4, 2]],
    ['ln(x^2 + 1)', [-3, 0.5, 4]],
    ['log(x)', [0.5, 2, 20]],
    ['log(x, 3)', [0.5, 2, 20]],
    ['log2(x) + log10(x)', [0.5, 2, 20]],
    ['2^x', [-1, 0.5, 3]],
    ['x^x', [0.4, 1.5, 3]],
    ['x^(2x)', [0.4, 1.5, 3]],
    ['hypot(x, 2x, 3)', [-2, 0.5, 4]],
    ['abs(x)', [-2, 3]],
    ['(x^2 + 1)/(x - 4)', [-2, 0.5, 3]],
    ['sin(cos(exp(x)))', [-1, 0.2, 1]],
    ['pow(x, 4) - pow(3, x)', [-1, 0.5, 2]],
  ];

  const evaluator = (source: string) => {
    const compiled = compile(parseExpression(source), { params: ['x'] });
    return (x: number) => compiled([x]);
  };

  for (const [source, points] of cases) {
    it(`agrees with the slope of ${source}`, () => {
      const f = evaluator(source);
      const exact = evaluator(toSource(derive(parseExpression(source), 'x')));
      for (const x of points) {
        const h = 1e-6 * Math.max(1, Math.abs(x));
        const approximate = (f(x + h) - f(x - h)) / (2 * h);
        const scale = Math.max(1, Math.abs(approximate));
        expect(Math.abs(exact(x) - approximate) / scale).toBeLessThan(1e-6);
      }
    });
  }
});

describe('a function defined in the workspace', () => {
  /** Stands in for what the workspace publishes for `f(x) = body`. */
  const define = (
    name: string,
    params: readonly string[],
    source: string,
    registry: Map<string, FunctionDefinition>,
    constants: Readonly<Record<string, number>> = BUILTIN_CONSTANTS,
  ): void => {
    const body = parseExpression(source, { isFunction: (n) => registry.has(n) });
    const compiled = compile(body, { params, functions: registry, constants });
    registry.set(name, {
      name,
      minArgs: params.length,
      maxArgs: params.length,
      apply: compiled,
      signature: `${name}(${params.join(', ')})`,
      description: 'test',
      derivative: definedFunctionRule(params, body, registry),
    });
  };

  it('differentiates through its body', () => {
    const registry = new Map(BUILTIN_FUNCTIONS);
    define('f', ['t'], 'sin(t)^2', registry);
    expect(toSource(derive(parseExpression('f(x)', { isFunction: (n) => registry.has(n) }), 'x', { functions: registry })))
      .toBe('2sin(x)cos(x)');
  });

  it('composes with the chain rule', () => {
    const registry = new Map(BUILTIN_FUNCTIONS);
    define('f', ['t'], 't^3', registry);
    const isFunction = (n: string) => registry.has(n);
    const derivative = derive(parseExpression('f(2x)', { isFunction }), 'x', {
      functions: registry,
    });
    expect(toSource(derivative)).toBe('6(2x)^2');
  });

  it('uses every parameter of a function of several variables', () => {
    const registry = new Map(BUILTIN_FUNCTIONS);
    define('g', ['u', 'v'], 'u v', registry);
    const isFunction = (n: string) => registry.has(n);
    // d/dx g(x, x^2) = v + u (2x) with u = x, v = x^2.
    const derivative = derive(parseExpression('g(x, x^2)', { isFunction }), 'x', {
      functions: registry,
    });
    const compiled = compile(derivative, { params: ['x'], functions: registry });
    // g(x, x^2) = x^3, so the derivative is 3x^2.
    expect(compiled([2])).toBeCloseTo(12, 10);
    expect(compiled([-3])).toBeCloseTo(27, 10);
  });

  it('reads a workspace value inside the body as a constant', () => {
    const registry = new Map(BUILTIN_FUNCTIONS);
    define('f', ['t'], 'a t^2', registry, { ...BUILTIN_CONSTANTS, a: 3 });
    const isFunction = (n: string) => registry.has(n);
    const derivative = derive(parseExpression('f(x)', { isFunction }), 'x', {
      functions: registry,
    });
    expect(toSource(derivative)).toBe('2a x');
  });

  it('builds the body of a named function’s derivative', () => {
    const body = deriveNamedFunction('sin', 'x', 2, BUILTIN_FUNCTIONS);
    expect(toSource(body)).toBe('-sin(x)');
  });
});

describe('substitute', () => {
  it('replaces free identifiers', () => {
    const result = substitute(parse('a x + b'), new Map([['x', num(2)]]));
    expect(toSource(result)).toBe('a 2 + b');
  });

  it('replaces every binding at once, so a swap is really a swap', () => {
    const bindings = new Map([
      ['x', id('y')],
      ['y', id('x')],
    ]);
    expect(toSource(substitute(parse('x - y'), bindings))).toBe('y - x');
  });

  it('leaves a call alone when only its arguments are bound', () => {
    expect(toSource(substitute(parse('sin(x)'), new Map([['x', id('t')]])))).toBe('sin(t)');
  });
});
