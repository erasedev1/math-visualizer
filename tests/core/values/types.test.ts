import { describe, expect, it } from 'vitest';
import {
  columnsArePlanePoints,
  matrix,
  number,
  planeColumns,
  point,
  vector,
} from '@/core/values/types';

describe('columnsArePlanePoints', () => {
  it('accepts a matrix of two rows, whatever its width', () => {
    expect(columnsArePlanePoints(matrix([[1, 2], [3, 4]]))).toBe(true);
    expect(columnsArePlanePoints(matrix([[1, 2, 3, 4, 5], [2, 4, 5, 4, 5]]))).toBe(true);
    expect(columnsArePlanePoints(matrix([[1], [2]]))).toBe(true);
  });

  it('refuses any other number of rows', () => {
    expect(columnsArePlanePoints(matrix([[1, 2, 3]]))).toBe(false);
    expect(columnsArePlanePoints(matrix([[1], [2], [3]]))).toBe(false);
  });

  it('refuses anything that is not a matrix', () => {
    expect(columnsArePlanePoints(number(2))).toBe(false);
    expect(columnsArePlanePoints(point(1, 2))).toBe(false);
    expect(columnsArePlanePoints(vector([1, 2]))).toBe(false);
  });
});

describe('planeColumns', () => {
  it('reads the x values from the top row and the y values from the bottom', () => {
    expect(planeColumns(matrix([[1, 2, 3], [4, 5, 6]]))).toEqual([
      { x: 1, y: 4 },
      { x: 2, y: 5 },
      { x: 3, y: 6 },
    ]);
  });

  it('gives one point per column, not per entry', () => {
    expect(planeColumns(matrix([[1, 2, 3, 4], [5, 6, 7, 8]]))).toHaveLength(4);
  });

  it('reads the identity as the two basis vectors', () => {
    expect(planeColumns(matrix([[1, 0], [0, 1]]))).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
  });
});
