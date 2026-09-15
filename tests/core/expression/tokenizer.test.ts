import { describe, expect, it } from 'vitest';
import { tokenize } from '@/core/expression/tokenizer';
import { ExpressionError } from '@/core/expression/errors';

const types = (source: string) => tokenize(source).map((t) => t.type);
const values = (source: string) => tokenize(source).map((t) => t.value);

describe('tokenize', () => {
  it('always terminates with an eof token', () => {
    expect(types('')).toEqual(['eof']);
    expect(types('1')).toEqual(['number', 'eof']);
  });

  it('reads integers, decimals and leading-dot decimals', () => {
    expect(tokenize('42')[0]?.numeric).toBe(42);
    expect(tokenize('3.25')[0]?.numeric).toBe(3.25);
    expect(tokenize('.5')[0]?.numeric).toBe(0.5);
  });

  it('reads exponent notation only when digits follow', () => {
    expect(tokenize('1e3')[0]?.numeric).toBe(1000);
    expect(tokenize('1.5e-2')[0]?.numeric).toBe(0.015);
    // `2e` is 2 * Euler's number, not a malformed exponent.
    expect(types('2e')).toEqual(['number', 'identifier', 'eof']);
    expect(tokenize('2e')[0]?.numeric).toBe(2);
  });

  it('matches identifiers greedily, including Greek letters', () => {
    expect(values('xy')).toEqual(['xy', '']);
    expect(values('x_1')).toEqual(['x_1', '']);
    expect(values('π')).toEqual(['π', '']);
    expect(values('sin')).toEqual(['sin', '']);
  });

  it('normalises ** to ^', () => {
    expect(values('2**3')).toEqual(['2', '^', '3', '']);
  });

  it('skips whitespace but keeps source positions', () => {
    const tokens = tokenize('  1 +  2');
    expect(tokens.map((t) => t.type)).toEqual(['number', 'operator', 'number', 'eof']);
    expect(tokens[2]?.start).toBe(7);
  });

  it('reports the position of an unexpected character', () => {
    expect(() => tokenize('1 $ 2')).toThrow(ExpressionError);
    try {
      tokenize('1 $ 2');
    } catch (error) {
      expect((error as ExpressionError).start).toBe(2);
    }
  });
});
