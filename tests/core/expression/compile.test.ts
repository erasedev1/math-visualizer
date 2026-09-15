import { describe, expect, it } from 'vitest';
import { compile, evaluate } from '@/core/expression/compile';
import { parseExpression } from '@/core/expression/parser';
import { ExpressionError } from '@/core/expression/errors';

/** Evaluates a source string with no free variables. */
const value = (source: string) => evaluate(parseExpression(source));

/** Compiles a source string as a function of x. */
const asFn = (source: string) => {
  const fn = compile(parseExpression(source), { params: ['x'] });
  return (x: number) => fn([x]);
};

describe('evaluate', () => {
  it('evaluates arithmetic', () => {
    expect(value('1 + 2 * 3')).toBe(7);
    expect(value('(1 + 2) * 3')).toBe(9);
    expect(value('2^10')).toBe(1024);
    expect(value('7/2')).toBe(3.5);
    expect(value('-3^2')).toBe(-9);
    expect(value('(-3)^2')).toBe(9);
  });

  it('evaluates built-in constants', () => {
    expect(value('pi')).toBeCloseTo(Math.PI, 15);
    expect(value('2pi')).toBeCloseTo(2 * Math.PI, 15);
    expect(value('e')).toBeCloseTo(Math.E, 15);
    expect(value('tau')).toBeCloseTo(2 * Math.PI, 15);
  });

  it('evaluates trigonometric identities', () => {
    expect(value('sin(pi/2)')).toBeCloseTo(1, 15);
    expect(value('cos(0)')).toBe(1);
    expect(value('sin(pi/6)^2 + cos(pi/6)^2')).toBeCloseTo(1, 15);
  });

  it('evaluates logarithms with the documented bases', () => {
    expect(value('ln(e)')).toBeCloseTo(1, 15);
    expect(value('log(1000)')).toBeCloseTo(3, 15);
    expect(value('log(8, 2)')).toBeCloseTo(3, 15);
    expect(value('log2(8)')).toBeCloseTo(3, 15);
  });

  it('evaluates roots and moduli', () => {
    expect(value('sqrt(16)')).toBe(4);
    expect(value('cbrt(-27)')).toBeCloseTo(-3, 15);
    expect(value('nthroot(-32, 5)')).toBeCloseTo(-2, 15);
    // mod takes the sign of the divisor, unlike the % operator in JavaScript.
    expect(value('mod(-1, 3)')).toBe(2);
    expect(value('hypot(3, 4)')).toBe(5);
  });

  it('propagates IEEE results instead of throwing', () => {
    expect(value('1/0')).toBe(Infinity);
    expect(value('sqrt(-1)')).toBeNaN();
    expect(value('ln(0)')).toBe(-Infinity);
  });

  it('reads caller-supplied variables', () => {
    expect(evaluate(parseExpression('a x^2'), { variables: { a: 3, x: 2 } })).toBe(12);
  });

  it('rejects unknown names and misused functions', () => {
    expect(() => value('q + 1')).toThrow(/Unknown name "q"/);
    expect(() => value('sin')).toThrow(/is a function/);
    // `nope` is not a known function, so `nope(2)` is the product `nope * 2`.
    expect(() => value('nope(2)')).toThrow(/Unknown name "nope"/);
  });

  it('reports a call to a name the parser was told is a function but is not', () => {
    const parsed = parseExpression('f(2)', { isFunction: (name) => name === 'f' });
    expect(() => evaluate(parsed)).toThrow(/Unknown function "f"/);
  });

  it('checks arity', () => {
    expect(() => value('sin(1, 2)')).toThrow(/sin takes 1 argument/);
    expect(() => value('atan2(1)')).toThrow(/atan2 takes 2 arguments/);
    expect(() => value('log(1, 2, 3)')).toThrow(/between 1 and 2/);
    expect(value('max(1, 7, 3)')).toBe(7);
  });
});

describe('compile', () => {
  it('binds parameters positionally', () => {
    const f = asFn('x^2');
    expect(f(3)).toBe(9);
    expect(f(-3)).toBe(9);
  });

  it('shadows a constant with a parameter of the same name', () => {
    const fn = compile(parseExpression('e'), { params: ['e'] });
    expect(fn([5])).toBe(5);
  });

  it('supports several parameters', () => {
    const fn = compile(parseExpression('x^2 + y^2'), { params: ['x', 'y'] });
    expect(fn([3, 4])).toBe(25);
  });

  it('folds constant subtrees', () => {
    // 2pi is constant, so the compiled tree evaluates it once at compile time.
    const fn = compile(parseExpression('2pi'), { params: ['x'] });
    expect(fn([0])).toBeCloseTo(2 * Math.PI, 15);
    expect(fn([1])).toBeCloseTo(2 * Math.PI, 15);
  });

  it('reports unknown names at compile time, not at evaluation time', () => {
    expect(() => compile(parseExpression('a x'), { params: ['x'] })).toThrow(ExpressionError);
  });

  it('is accurate across a sampled domain', () => {
    const f = asFn('sin(x)/x');
    for (let x = 0.1; x < 10; x += 0.1) {
      expect(f(x)).toBeCloseTo(Math.sin(x) / x, 12);
    }
  });
});
