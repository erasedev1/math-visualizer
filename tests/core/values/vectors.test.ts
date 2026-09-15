import { describe, expect, it } from 'vitest';
import { evaluateValue } from '@/core/values/evaluate';
import { parseExpression } from '@/core/expression/parser';
import { VALUE_FUNCTIONS } from '@/core/values/functions';
import { BUILTIN_FUNCTIONS } from '@/core/expression/functions';
import { describeValue, matrix, point, vector, type Value } from '@/core/values/types';
import { formatDisplayNumber } from '@/core/expression/print';

const isFunction = (name: string) => VALUE_FUNCTIONS.has(name) || BUILTIN_FUNCTIONS.has(name);

function evaluate(source: string, values: Record<string, Value> = {}): Value {
  return evaluateValue(parseExpression(source, { isFunction }), {
    values: new Map(Object.entries(values)),
  });
}

function components(source: string, values: Record<string, Value> = {}): readonly number[] {
  const result = evaluate(source, values);
  if (result.kind !== 'vector') throw new Error(`expected a vector, got ${result.kind}`);
  return result.components;
}

function rows(source: string, values: Record<string, Value> = {}): readonly (readonly number[])[] {
  const result = evaluate(source, values);
  if (result.kind !== 'matrix') throw new Error(`expected a matrix, got ${result.kind}`);
  return result.rows;
}

function scalar(source: string, values: Record<string, Value> = {}): number {
  const result = evaluate(source, values);
  if (result.kind !== 'number') throw new Error(`expected a number, got ${result.kind}`);
  return result.value;
}

describe('vector literals', () => {
  it('reads components between angle brackets', () => {
    expect(components('<3, 4>')).toEqual([3, 4]);
    expect(components('<1, 2, 3>')).toEqual([1, 2, 3]);
    expect(components('<1 + 1, 2 * 3>')).toEqual([2, 6]);
  });

  it('is distinct from a point', () => {
    expect(evaluate('<3, 4>').kind).toBe('vector');
    expect(evaluate('(3, 4)').kind).toBe('point');
  });

  it('rejects an empty vector', () => {
    expect(() => evaluate('<>')).toThrow(/at least one component/);
  });

  it('takes part in implicit multiplication', () => {
    expect(components('2<3, 4>')).toEqual([6, 8]);
  });
});

describe('vector arithmetic', () => {
  it('adds, subtracts, scales and negates', () => {
    expect(components('<1, 2> + <3, 4>')).toEqual([4, 6]);
    expect(components('<3, 4> - <1, 2>')).toEqual([2, 2]);
    expect(components('3 <1, 2>')).toEqual([3, 6]);
    expect(components('<2, 4> / 2')).toEqual([1, 2]);
    expect(components('-<1, -2>')).toEqual([-1, 2]);
  });

  it('refuses vectors of different lengths', () => {
    expect(() => evaluate('<1, 2> + <1, 2, 3>')).toThrow(/2 and 3 components/);
  });

  it('gives the displacement between two points', () => {
    const A = point(1, 1);
    const B = point(4, 5);
    const difference = evaluate('B - A', { A, B });
    expect(difference.kind).toBe('vector');
    expect(difference.kind === 'vector' && difference.components).toEqual([3, 4]);
  });

  it('moves a point by a vector', () => {
    const A = point(1, 1);
    expect(evaluate('A + <2, 3>', { A })).toEqual(point(3, 4));
    expect(evaluate('A - <1, 1>', { A })).toEqual(point(0, 0));
    expect(evaluate('<2, 3> + A', { A })).toEqual(point(3, 4));
  });

  it('still adds points componentwise, so the midpoint idiom works', () => {
    const A = point(0, 0);
    const B = point(4, 2);
    expect(evaluate('(A + B)/2', { A, B })).toEqual(point(2, 1));
  });
});

describe('vector functions', () => {
  it('measures magnitude', () => {
    expect(scalar('magnitude(<3, 4>)')).toBe(5);
    expect(scalar('magnitude(<1, 2, 2>)')).toBe(3);
  });

  it('normalizes to unit length', () => {
    expect(components('normalize(<3, 4>)')).toEqual([0.6, 0.8]);
    expect(scalar('magnitude(normalize(<5, -12>))')).toBeCloseTo(1, 12);
    expect(() => evaluate('normalize(<0, 0>)')).toThrow(/zero vector/);
  });

  it('computes the dot product', () => {
    expect(scalar('dot(<1, 2>, <3, 4>)')).toBe(11);
    // Perpendicular vectors have a zero dot product.
    expect(scalar('dot(<1, 0>, <0, 1>)')).toBe(0);
  });

  it('computes the cross product in 3D and 2D', () => {
    expect(components('cross(<1, 0, 0>, <0, 1, 0>)')).toEqual([0, 0, 1]);
    // In the plane the cross product is the signed area, a number.
    expect(scalar('cross(<1, 0>, <0, 1>)')).toBe(1);
    expect(scalar('cross(<2, 3>, <4, 6>)')).toBe(0);
  });

  it('makes a cross product perpendicular to both inputs', () => {
    expect(scalar('dot(cross(<1, 2, 3>, <4, 5, 6>), <1, 2, 3>)')).toBeCloseTo(0, 12);
    expect(scalar('dot(cross(<1, 2, 3>, <4, 5, 6>), <4, 5, 6>)')).toBeCloseTo(0, 12);
  });

  it('projects one vector onto another', () => {
    expect(components('projection(<3, 4>, <1, 0>)')).toEqual([3, 0]);
    // Projecting onto itself changes nothing.
    expect(components('projection(<2, 5>, <2, 5>)')).toEqual([2, 5]);
    expect(() => evaluate('projection(<1, 1>, <0, 0>)')).toThrow(/zero vector/);
  });

  it('measures the angle between vectors', () => {
    expect(scalar('angle(<1, 0>, <0, 1>)')).toBeCloseTo(Math.PI / 2, 12);
    expect(scalar('angle(<1, 0>, <1, 0>)')).toBeCloseTo(0, 12);
    expect(scalar('angle(<1, 0>, <-1, 0>)')).toBeCloseTo(Math.PI, 12);
    expect(scalar('angle(<1, 1>, <0, 1>)')).toBeCloseTo(Math.PI / 4, 12);
  });

  it('builds a vector from two points, anchored at the first', () => {
    const A = point(1, 1);
    const B = point(4, 5);
    const result = evaluate('vector(A, B)', { A, B });
    expect(result.kind === 'vector' && result.components).toEqual([3, 4]);
    expect(result.kind === 'vector' && result.anchor).toEqual({ x: 1, y: 1 });
  });
});

describe('matrix literals', () => {
  it('reads rows between brackets', () => {
    expect(rows('[[1, 2], [3, 4]]')).toEqual([[1, 2], [3, 4]]);
  });

  it('reads a flat list as a single row', () => {
    expect(rows('[1, 2, 3]')).toEqual([[1, 2, 3]]);
  });

  it('rejects ragged rows and empty matrices', () => {
    expect(() => evaluate('[[1, 2], [3]]')).toThrow(/same length/);
    expect(() => evaluate('[]')).toThrow(/at least one row/);
  });

  it('rejects a row that is not numbers', () => {
    expect(() => evaluate('[(1, 2), [3, 4]]')).toThrow(/not a row of numbers/);
  });
});

describe('matrix arithmetic', () => {
  const A = { A: { kind: 'matrix', rows: [[1, 2], [3, 4]] } as Value };

  it('adds and subtracts matrices of the same shape', () => {
    expect(rows('A + A', A)).toEqual([[2, 4], [6, 8]]);
    expect(rows('A - A', A)).toEqual([[0, 0], [0, 0]]);
  });

  it('refuses matrices of different shapes, naming both', () => {
    expect(() => evaluate('A + [[1, 2, 3]]', A)).toThrow(/2×2 matrix and a 1×3 matrix/);
  });

  it('scales by a number', () => {
    expect(rows('2 A', A)).toEqual([[2, 4], [6, 8]]);
    expect(rows('A / 2', A)).toEqual([[0.5, 1], [1.5, 2]]);
    expect(rows('-A', A)).toEqual([[-1, -2], [-3, -4]]);
  });

  it('multiplies matrices', () => {
    expect(rows('A * identity(2)', A)).toEqual([[1, 2], [3, 4]]);
    expect(rows('[[1, 2, 3]] * [[4], [5], [6]]')).toEqual([[32]]);
  });

  it('refuses a product whose inner sizes disagree', () => {
    expect(() => evaluate('A * [[1, 2, 3]]', A)).toThrow(/2 columns and the second has 1 row/);
  });

  it('applies a matrix to a vector', () => {
    expect(components('A * <1, 1>', A)).toEqual([3, 7]);
    expect(() => evaluate('A * <1, 1, 1>', A)).toThrow(/3 components/);
  });
});

describe('matrix functions', () => {
  const A = { A: { kind: 'matrix', rows: [[1, 2], [3, 4]] } as Value };

  it('transposes, inverts and measures', () => {
    expect(rows('transpose(A)', A)).toEqual([[1, 3], [2, 4]]);
    expect(scalar('det(A)', A)).toBeCloseTo(-2, 12);
    expect(scalar('rank(A)', A)).toBe(2);
    expect(rows('A * inverse(A)', A)[0]![0]).toBeCloseTo(1, 10);
  });

  it('solves a linear system', () => {
    // x + 2y = 5, 3x + 4y = 11
    expect(components('solve(A, <5, 11>)', A)[0]).toBeCloseTo(1, 10);
    expect(components('solve(A, <5, 11>)', A)[1]).toBeCloseTo(2, 10);
  });

  it('reports the geometric failures plainly', () => {
    expect(() => evaluate('inverse([[1, 2], [2, 4]])')).toThrow(/singular/);
    expect(() => evaluate('det([[1, 2, 3]])')).toThrow(/square/);
    expect(() => evaluate('solve(A, <1>)', A)).toThrow(/2 components/);
    expect(() => evaluate('solve([[1, 2], [2, 4]], <1, 2>)')).toThrow(/no single solution/);
  });

  it('returns eigenvalues as a row and eigenvectors as columns', () => {
    expect(rows('eigenvalues([[2, 1], [1, 2]])')[0]![0]).toBeCloseTo(3, 10);
    expect(rows('eigenvalues([[2, 1], [1, 2]])')[0]![1]).toBeCloseTo(1, 10);

    const vectors = rows('eigenvectors([[2, 1], [1, 2]])');
    expect(vectors.length).toBe(2);
    // The first column is the eigenvector for eigenvalue 3, along (1, 1).
    expect(Math.abs(vectors[0]![0]!)).toBeCloseTo(Math.abs(vectors[1]![0]!), 10);
  });

  it('says so rather than guessing when eigenvalues are not real', () => {
    expect(() => evaluate('eigenvalues([[0, -1], [1, 0]])')).toThrow(/no real eigenvalues/);
    expect(() => evaluate('eigenvalues([[1, 2, 3], [4, 5, 6], [7, 8, 10]])')).toThrow(/symmetric/);
  });
});

describe('describeValue', () => {
  // The formatter takes an optional precision, so passing it straight to map
  // would hand it an array index and throw.
  it('formats every component of a vector', () => {
    expect(describeValue(vector([1.23456789, 2, 3]), formatDisplayNumber)).toBe('<1.23457, 2, 3>');
  });

  it('formats points, numbers and matrices', () => {
    expect(describeValue(point(1.5, -2), formatDisplayNumber)).toBe('(1.5, -2)');
    expect(describeValue({ kind: 'number', value: 1 / 3 }, formatDisplayNumber)).toBe('0.333333');
    expect(describeValue(matrix([[1, 2], [3, 4]]), formatDisplayNumber)).toBe('2\u00d72 matrix');
  });
});
