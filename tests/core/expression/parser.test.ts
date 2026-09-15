import { describe, expect, it } from 'vitest';
import { parse, parseExpression } from '@/core/expression/parser';
import { toSource } from '@/core/expression/print';
import { ExpressionError } from '@/core/expression/errors';
import { binary, id, num, call, unary } from '@/core/expression/ast';

/** Parses and prints, which makes associativity and grouping visible. */
const round = (source: string) => toSource(parseExpression(source));

describe('parse', () => {
  it('parses arithmetic with correct precedence', () => {
    expect(round('1 + 2 * 3')).toBe('1 + 2 * 3');
    expect(round('(1 + 2) * 3')).toBe('(1 + 2) * 3');
    expect(round('2x + 5')).toBe('2x + 5');
  });

  it('keeps + and - left associative', () => {
    expect(parseExpression('1 - 2 - 3')).toEqual(
      binary('-', binary('-', num(1), num(2)), num(3)),
    );
    expect(round('1 - (2 - 3)')).toBe('1 - (2 - 3)');
  });

  it('makes ^ right associative and tighter than unary minus', () => {
    expect(parseExpression('2^3^2')).toEqual(binary('^', num(2), binary('^', num(3), num(2))));
    expect(parseExpression('-x^2')).toEqual(unary('-', binary('^', id('x'), num(2))));
    expect(parseExpression('2^-1')).toEqual(binary('^', num(2), unary('-', num(1))));
  });

  it('inserts implicit multiplication for juxtaposition', () => {
    expect(parseExpression('2x')).toEqual(binary('*', num(2), id('x'), true));
    expect(parseExpression('3(x + 1)')).toEqual(
      binary('*', num(3), binary('+', id('x'), num(1)), true),
    );
    expect(parseExpression('2pi')).toEqual(binary('*', num(2), id('pi'), true));
    expect(round('sin(x)cos(x)')).toBe('sin(x)cos(x)');
  });

  it('binds implicit multiplication looser than a power', () => {
    // 2x^2 is 2*(x^2), not (2x)^2.
    expect(parseExpression('2x^2')).toEqual(
      binary('*', num(2), binary('^', id('x'), num(2)), true),
    );
  });

  it('evaluates chained multiplication and division left to right', () => {
    // 1/2x is (1/2)*x, the conventional reading for a linear text formula.
    expect(parseExpression('1/2x')).toEqual(
      binary('*', binary('/', num(1), num(2)), id('x'), true),
    );
  });

  it('treats a known function name before "(" as a call', () => {
    expect(parseExpression('sin(x)')).toEqual(call('sin', [id('x')]));
    expect(parseExpression('log(x, 2)')).toEqual(call('log', [id('x'), num(2)]));
    expect(parseExpression('sqrt(2x)')).toEqual(
      call('sqrt', [binary('*', num(2), id('x'), true)]),
    );
  });

  it('treats an unknown name before "(" as a product', () => {
    expect(parseExpression('a(x + 1)')).toEqual(
      binary('*', id('a'), binary('+', id('x'), num(1)), true),
    );
  });

  it('respects a custom isFunction predicate', () => {
    const parsed = parseExpression('f(2)', { isFunction: (name) => name === 'f' });
    expect(parsed).toEqual(call('f', [num(2)]));
  });

  it('parses nested calls and powers of calls', () => {
    expect(round('sin(x)^2')).toBe('sin(x)^2');
    expect(round('sqrt(sin(x)^2 + cos(x)^2)')).toBe('sqrt(sin(x)^2 + cos(x)^2)');
    expect(round('(x^2 + 1)/(x - 3)')).toBe('(x^2 + 1) / (x - 3)');
  });

  it('parses an equality at the top level', () => {
    const root = parse('y = x^2');
    expect(root.type).toBe('Equality');
    expect(toSource(root)).toBe('y = x^2');
  });

  it('rejects an equality where a value is expected', () => {
    expect(() => parseExpression('y = x')).toThrow(/not allowed/);
    expect(() => parse('1 = 2 = 3')).toThrow(/Only one/);
    expect(() => parse('sin(x = 1)')).toThrow(ExpressionError);
  });

  it('reports unbalanced parentheses and dangling operators', () => {
    expect(() => parseExpression('(1 + 2')).toThrow(/Expected "\)"/);
    expect(() => parseExpression('1 +')).toThrow(/Expected a value/);
    expect(() => parseExpression('1 + 2)')).toThrow(/Unexpected/);
    expect(() => parseExpression('')).toThrow(/Expected a value/);
    expect(() => parseExpression('* 2')).toThrow(/Expected a value/);
  });
});
