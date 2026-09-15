import { describe, expect, it } from 'vitest';
import { parse, parseExpression } from '@/core/expression/parser';
import { formatNumber, toSource } from '@/core/expression/print';

/** Printing then re-parsing must produce the same tree. */
function expectRoundTrip(source: string): string {
  const first = parseExpression(source);
  const printed = toSource(first);
  expect(parseExpression(printed)).toEqual(first);
  return printed;
}

describe('toSource', () => {
  it('omits parentheses that the grammar does not need', () => {
    expect(expectRoundTrip('(2 * 3) + 4')).toBe('2 * 3 + 4');
    expect(expectRoundTrip('x^(2)')).toBe('x^2');
    expect(expectRoundTrip('((x))')).toBe('x');
  });

  it('keeps parentheses that change meaning', () => {
    expect(expectRoundTrip('2 * (3 + 4)')).toBe('2 * (3 + 4)');
    expect(expectRoundTrip('1 - (2 - 3)')).toBe('1 - (2 - 3)');
    expect(expectRoundTrip('a / (b * c)')).toBe('a / (b * c)');
    expect(expectRoundTrip('(2x)^2')).toBe('(2x)^2');
    expect(expectRoundTrip('(-x)^2')).toBe('(-x)^2');
    expect(expectRoundTrip('(2^3)^4')).toBe('(2^3)^4');
    expect(expectRoundTrip('2^3^4')).toBe('2^3^4');
  });

  it('prints juxtaposition without an operator, adding a space only if needed', () => {
    expect(expectRoundTrip('2x')).toBe('2x');
    expect(expectRoundTrip('2 pi')).toBe('2pi');
    expect(expectRoundTrip('x y')).toBe('x y');
    expect(expectRoundTrip('x 2')).toBe('x 2');
    expect(expectRoundTrip('2 e3')).toBe('2 e3');
    expect(expectRoundTrip('3(x + 1)')).toBe('3(x + 1)');
    expect(expectRoundTrip('2(-x)')).toBe('2(-x)');
  });

  it('round-trips the sample expressions from the product brief', () => {
    for (const source of [
      'x^2',
      'sin(x)',
      'sqrt(x)',
      'log(x)',
      'e^x',
      '2x + 5',
      '(x^2 + 1)/(x - 3)',
      'sin(x)^2',
      '2pi',
      'sqrt(2x)',
      'a sin(b x + c)',
    ]) {
      expectRoundTrip(source);
    }
  });

  it('prints an equality', () => {
    expect(toSource(parse('f = 2x'))).toBe('f = 2x');
  });
});

describe('formatNumber', () => {
  it('prints integers exactly', () => {
    expect(formatNumber(5)).toBe('5');
    expect(formatNumber(-5)).toBe('-5');
    expect(formatNumber(0)).toBe('0');
  });

  it('trims floating-point noise', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0.3');
    expect(formatNumber(1 / 3)).toBe('0.333333333333');
  });

  it('prints non-finite values readably', () => {
    expect(formatNumber(Infinity)).toBe('infinity');
    expect(formatNumber(NaN)).toBe('NaN');
  });
});
