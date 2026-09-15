import { describe, expect, it } from 'vitest';
import {
  add,
  apply,
  determinant,
  dimensions,
  eigen,
  identity,
  inverse,
  isRectangular,
  isSquare,
  isSymmetric,
  multiply,
  rank,
  scale,
  solve,
  subtract,
  transpose,
  type Matrix,
} from '@/core/values/matrix';

const A: Matrix = [
  [1, 2],
  [3, 4],
];

/** Asserts two matrices agree entry by entry. */
function expectMatrix(actual: Matrix, expected: Matrix, digits = 10): void {
  expect(dimensions(actual)).toEqual(dimensions(expected));
  actual.forEach((row, i) => {
    row.forEach((entry, j) => {
      expect(entry).toBeCloseTo(expected[i]![j]!, digits);
    });
  });
}

describe('shape', () => {
  it('reports dimensions', () => {
    expect(dimensions(A)).toEqual({ rows: 2, columns: 2 });
    expect(dimensions([[1, 2, 3]])).toEqual({ rows: 1, columns: 3 });
  });

  it('recognises rectangular, square and symmetric matrices', () => {
    expect(isRectangular(A)).toBe(true);
    expect(isRectangular([[1, 2], [3]])).toBe(false);
    expect(isRectangular([])).toBe(false);
    expect(isSquare([[1, 2, 3]])).toBe(false);
    expect(isSymmetric([[1, 2], [2, 1]])).toBe(true);
    expect(isSymmetric(A)).toBe(false);
  });
});

describe('arithmetic', () => {
  it('adds, subtracts and scales entry by entry', () => {
    expectMatrix(add(A, A), [[2, 4], [6, 8]]);
    expectMatrix(subtract(A, A), [[0, 0], [0, 0]]);
    expectMatrix(scale(A, 3), [[3, 6], [9, 12]]);
  });

  it('multiplies rows into columns', () => {
    expectMatrix(multiply(A, identity(2)), A);
    expectMatrix(multiply(A, [[0, 1], [1, 0]]), [[2, 1], [4, 3]]);
  });

  it('multiplies non-square matrices of matching inner size', () => {
    const wide: Matrix = [[1, 2, 3]];
    const tall: Matrix = [[4], [5], [6]];
    expectMatrix(multiply(wide, tall), [[32]]);
    expectMatrix(multiply(tall, wide), [[4, 8, 12], [5, 10, 15], [6, 12, 18]]);
  });

  it('is associative', () => {
    const B: Matrix = [[0, 1], [2, 3]];
    const C: Matrix = [[4, 5], [6, 7]];
    expectMatrix(multiply(multiply(A, B), C), multiply(A, multiply(B, C)));
  });

  it('applies a matrix to a column vector', () => {
    expect(apply(A, [1, 1])).toEqual([3, 7]);
    expect(apply(identity(3), [2, 4, 6])).toEqual([2, 4, 6]);
  });

  it('transposes, and does so reversibly', () => {
    expectMatrix(transpose(A), [[1, 3], [2, 4]]);
    expectMatrix(transpose(transpose(A)), A);
    expectMatrix(transpose([[1, 2, 3]]), [[1], [2], [3]]);
  });

  it('transposes a product in reverse order', () => {
    const B: Matrix = [[0, 1], [2, 3]];
    expectMatrix(transpose(multiply(A, B)), multiply(transpose(B), transpose(A)));
  });
});

describe('determinant', () => {
  it('matches the analytical value', () => {
    expect(determinant(A)).toBeCloseTo(-2, 12);
    expect(determinant([[5]])).toBe(5);
    expect(determinant(identity(4))).toBeCloseTo(1, 12);
  });

  it('computes a 3x3 determinant', () => {
    expect(determinant([[6, 1, 1], [4, -2, 5], [2, 8, 7]])).toBeCloseTo(-306, 10);
  });

  it('is zero for a singular matrix', () => {
    expect(determinant([[1, 2], [2, 4]])).toBeCloseTo(0, 12);
    expect(determinant([[1, 2, 3], [4, 5, 6], [7, 8, 9]])).toBeCloseTo(0, 8);
  });

  it('multiplies over a product', () => {
    const B: Matrix = [[2, 0], [1, 3]];
    expect(determinant(multiply(A, B))).toBeCloseTo(determinant(A) * determinant(B), 10);
  });

  it('flips sign when two rows are swapped', () => {
    expect(determinant([[3, 4], [1, 2]])).toBeCloseTo(-determinant(A), 12);
  });

  it('is not a number for a non-square matrix', () => {
    expect(determinant([[1, 2, 3]])).toBeNaN();
  });

  it('stays accurate when the natural pivot is tiny', () => {
    // Without partial pivoting this loses most of its digits.
    expect(determinant([[1e-14, 1], [1, 1]])).toBeCloseTo(-1, 10);
  });
});

describe('inverse', () => {
  it('produces the identity when multiplied back', () => {
    const result = inverse(A);
    expect(result).not.toBeNull();
    expectMatrix(multiply(A, result!), identity(2));
    expectMatrix(result!, [[-2, 1], [1.5, -0.5]]);
  });

  it('inverts a larger matrix', () => {
    const M: Matrix = [[2, 1, 1], [1, 3, 2], [1, 0, 0]];
    expectMatrix(multiply(M, inverse(M)!), identity(3), 9);
  });

  it('returns null for a singular or non-square matrix', () => {
    expect(inverse([[1, 2], [2, 4]])).toBeNull();
    expect(inverse([[1, 2, 3]])).toBeNull();
  });
});

describe('rank', () => {
  it('counts independent rows', () => {
    expect(rank(A)).toBe(2);
    expect(rank([[1, 2], [2, 4]])).toBe(1);
    expect(rank([[0, 0], [0, 0]])).toBe(0);
    expect(rank([[1, 2, 3], [4, 5, 6], [7, 8, 9]])).toBe(2);
  });

  it('works on non-square matrices', () => {
    expect(rank([[1, 2, 3], [2, 4, 6]])).toBe(1);
    expect(rank([[1, 0], [0, 1], [1, 1]])).toBe(2);
  });
});

describe('solve', () => {
  it('solves a system whose answer is known', () => {
    // x + 2y = 5, 3x + 4y = 11  ->  x = 1, y = 2
    const solution = solve(A, [5, 11]);
    expect(solution).not.toBeNull();
    expect(solution![0]).toBeCloseTo(1, 10);
    expect(solution![1]).toBeCloseTo(2, 10);
  });

  it('agrees with multiplying by the inverse', () => {
    const M: Matrix = [[4, -2, 1], [3, 6, -4], [2, 1, 8]];
    const b = [1, -2, 5];
    const direct = solve(M, b)!;
    const viaInverse = apply(inverse(M)!, b);
    direct.forEach((value, i) => expect(value).toBeCloseTo(viaInverse[i]!, 9));
  });

  it('reproduces the right-hand side when substituted back', () => {
    const M: Matrix = [[0, 1, 2], [1, 0, 3], [4, -3, 8]];
    const b = [3, 5, 7];
    const solution = solve(M, b)!;
    apply(M, solution).forEach((value, i) => expect(value).toBeCloseTo(b[i]!, 9));
  });

  it('returns null when there is no single solution', () => {
    expect(solve([[1, 2], [2, 4]], [1, 2])).toBeNull();
    expect(solve(A, [1])).toBeNull();
  });
});

describe('eigen', () => {
  it('finds the eigenvalues of a symmetric matrix', () => {
    const result = eigen([[2, 1], [1, 2]]);
    expect(result).not.toBeNull();
    expect(result!.values[0]).toBeCloseTo(3, 10);
    expect(result!.values[1]).toBeCloseTo(1, 10);
  });

  it('returns vectors that satisfy A v = lambda v', () => {
    const M: Matrix = [[4, 1], [2, 3]];
    const result = eigen(M)!;
    result.values.forEach((value, index) => {
      const vector = result.vectors[index]!;
      const applied = apply(M, vector);
      applied.forEach((entry, i) => expect(entry).toBeCloseTo(value * vector[i]!, 9));
    });
  });

  it('finds eigenvalues of a diagonal matrix directly', () => {
    const result = eigen([[5, 0, 0], [0, -2, 0], [0, 0, 1]])!;
    expect([...result.values].sort((a, b) => a - b).map((v) => Math.round(v))).toEqual([-2, 1, 5]);
  });

  it('handles a symmetric 3x3, with eigenvalues summing to the trace', () => {
    const M: Matrix = [[6, 2, 1], [2, 3, 1], [1, 1, 1]];
    const result = eigen(M)!;
    const total = result.values.reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(10, 8);
    const product = result.values.reduce((all, value) => all * value, 1);
    expect(product).toBeCloseTo(determinant(M), 6);
  });

  it('orders eigenvalues from largest to smallest', () => {
    const result = eigen([[1, 0], [0, 9]])!;
    expect(result.values[0]).toBeGreaterThan(result.values[1]!);
  });

  it('returns null rather than guessing at complex eigenvalues', () => {
    // A quarter-turn rotation has no real eigenvalues.
    expect(eigen([[0, -1], [1, 0]])).toBeNull();
  });

  it('returns null for a general matrix larger than 2x2', () => {
    expect(eigen([[1, 2, 3], [4, 5, 6], [7, 8, 10]])).toBeNull();
  });
});
