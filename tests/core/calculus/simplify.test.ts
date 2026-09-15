import { describe, expect, it } from 'vitest';
import { isOne, isZero, literalOf, simplify } from '@/core/calculus/simplify';
import { parseExpression } from '@/core/expression/parser';
import { toSource } from '@/core/expression/print';

const tidy = (source: string) => toSource(simplify(parseExpression(source)));

describe('simplify', () => {
  it('removes the identities that differentiation leaves behind', () => {
    expect(tidy('x + 0')).toBe('x');
    expect(tidy('0 + x')).toBe('x');
    expect(tidy('x - 0')).toBe('x');
    expect(tidy('0 - x')).toBe('-x');
    expect(tidy('1 * x')).toBe('x');
    expect(tidy('x * 1')).toBe('x');
    expect(tidy('0 * sin(x)')).toBe('0');
    expect(tidy('x / 1')).toBe('x');
    expect(tidy('x^1')).toBe('x');
    expect(tidy('x^0')).toBe('1');
    expect(tidy('1^x')).toBe('1');
    expect(tidy('+x')).toBe('x');
  });

  it('folds arithmetic on literals', () => {
    expect(tidy('2 + 3')).toBe('5');
    expect(tidy('2 - 5')).toBe('-3');
    expect(tidy('3 * 4')).toBe('12');
    expect(tidy('6 / 3')).toBe('2');
    expect(tidy('2^10')).toBe('1024');
    expect(tidy('x^(3 - 1)')).toBe('x^2');
  });

  it('leaves a fraction alone rather than turning it into a decimal', () => {
    // `0.333333333333` is not an improvement on `1/3`.
    expect(tidy('1 / 3')).toBe('1 / 3');
    expect(tidy('2^0.5')).toBe('2^0.5');
  });

  it('puts a numeric coefficient in front and associates to the left', () => {
    // `a * (2 * x)` would print `a(2x)`, which reads as a function call.
    expect(tidy('a * (2 * x)')).toBe('2a x');
    expect(tidy('x^2 * 3')).toBe('3x^2');
    expect(tidy('2 * (3 * x)')).toBe('6x');
    expect(tidy('2 * (x * 3)')).toBe('6x');
  });

  it('moves a sign to the front, where it is read once', () => {
    expect(tidy('-(-x)')).toBe('x');
    expect(tidy('-1 * x')).toBe('-x');
    expect(tidy('x * -1')).toBe('-x');
    expect(tidy('(-2) * x * sin(x)')).toBe('-2x sin(x)');
    // With no coefficient to carry the sign it stays a unary minus, and the
    // printer brackets what it applies to rather than relying on precedence.
    expect(tidy('sin(x) * (-cos(x))')).toBe('-(sin(x)cos(x))');
    expect(tidy('x + (-3)')).toBe('x - 3');
    expect(tidy('x - (-3)')).toBe('x + 3');
  });

  it('simplifies inside a call but does not evaluate one', () => {
    // `ln(10)` is the readable form of the constant; 0.434 is not.
    expect(tidy('ln(10)')).toBe('ln(10)');
    expect(tidy('sin(x * 1 + 0)')).toBe('sin(x)');
  });

  it('simplifies inside points, vectors and matrices', () => {
    expect(tidy('(x * 1, 0 + 2)')).toBe('(x, 2)');
    expect(tidy('<1 * a, 2 + 3>')).toBe('<a, 5>');
    expect(tidy('[[x + 0, 2 * 3]]')).toBe('[[x, 6]]');
  });

  it('keeps a result that would overflow symbolic', () => {
    expect(tidy('10^400')).toBe('10^400');
  });

  it('reads the literal an expression certainly is', () => {
    expect(literalOf(parseExpression('3'))).toBe(3);
    expect(literalOf(parseExpression('-3'))).toBe(-3);
    expect(literalOf(parseExpression('x'))).toBe(null);
    expect(literalOf(parseExpression('1 + 2'))).toBe(null);
    expect(isZero(parseExpression('0'))).toBe(true);
    expect(isZero(parseExpression('x'))).toBe(false);
    expect(isOne(parseExpression('1'))).toBe(true);
    expect(isOne(parseExpression('-1'))).toBe(false);
  });
});
