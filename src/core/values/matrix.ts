/**
 * Dense linear algebra on plain arrays of rows.
 *
 * No knowledge of expressions, values or the workspace, so every routine can
 * be checked directly against an analytical result. Numerically, the rule
 * throughout is partial pivoting and a tolerance scaled to the size of the
 * entries, rather than comparing against zero.
 */

export type Matrix = readonly (readonly number[])[];

export interface Dimensions {
  readonly rows: number;
  readonly columns: number;
}

export function dimensions(matrix: Matrix): Dimensions {
  return { rows: matrix.length, columns: matrix[0]?.length ?? 0 };
}

/** True when every row is the same non-zero length. */
export function isRectangular(matrix: Matrix): boolean {
  const { rows, columns } = dimensions(matrix);
  if (rows === 0 || columns === 0) return false;
  return matrix.every((row) => row.length === columns);
}

export function isSquare(matrix: Matrix): boolean {
  const { rows, columns } = dimensions(matrix);
  return rows > 0 && rows === columns;
}

export function isSymmetric(matrix: Matrix, tolerance = toleranceFor(matrix)): boolean {
  if (!isSquare(matrix)) return false;
  const { rows } = dimensions(matrix);
  for (let i = 0; i < rows; i += 1) {
    for (let j = i + 1; j < rows; j += 1) {
      if (Math.abs(matrix[i]![j]! - matrix[j]![i]!) > tolerance) return false;
    }
  }
  return true;
}

/** A tolerance proportional to the largest entry, never smaller than epsilon. */
export function toleranceFor(matrix: Matrix): number {
  let largest = 0;
  for (const row of matrix) {
    for (const entry of row) largest = Math.max(largest, Math.abs(entry));
  }
  return Math.max(largest, 1) * 1e-12;
}

export function clone(matrix: Matrix): number[][] {
  return matrix.map((row) => [...row]);
}

export function sameShape(a: Matrix, b: Matrix): boolean {
  const first = dimensions(a);
  const second = dimensions(b);
  return first.rows === second.rows && first.columns === second.columns;
}

export function add(a: Matrix, b: Matrix): number[][] {
  return a.map((row, i) => row.map((entry, j) => entry + b[i]![j]!));
}

export function subtract(a: Matrix, b: Matrix): number[][] {
  return a.map((row, i) => row.map((entry, j) => entry - b[i]![j]!));
}

export function scale(matrix: Matrix, factor: number): number[][] {
  return matrix.map((row) => row.map((entry) => entry * factor));
}

export function transpose(matrix: Matrix): number[][] {
  const { rows, columns } = dimensions(matrix);
  const result: number[][] = [];
  for (let j = 0; j < columns; j += 1) {
    const row: number[] = [];
    for (let i = 0; i < rows; i += 1) row.push(matrix[i]![j]!);
    result.push(row);
  }
  return result;
}

export function multiply(a: Matrix, b: Matrix): number[][] {
  const left = dimensions(a);
  const right = dimensions(b);
  const result: number[][] = [];
  for (let i = 0; i < left.rows; i += 1) {
    const row: number[] = [];
    for (let j = 0; j < right.columns; j += 1) {
      let total = 0;
      for (let k = 0; k < left.columns; k += 1) total += a[i]![k]! * b[k]![j]!;
      row.push(total);
    }
    result.push(row);
  }
  return result;
}

/** Matrix times column vector. */
export function apply(matrix: Matrix, vector: readonly number[]): number[] {
  return matrix.map((row) => row.reduce((total, entry, j) => total + entry * vector[j]!, 0));
}

export function identity(size: number): number[][] {
  return Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) => (i === j ? 1 : 0)),
  );
}

interface Elimination {
  readonly rows: number[][];
  /** Product of the pivots, with the sign of the row swaps applied. */
  readonly determinant: number;
  readonly pivotColumns: number[];
}

/** Gaussian elimination to row echelon form, with partial pivoting. */
function eliminate(matrix: Matrix, tolerance: number): Elimination {
  const rows = clone(matrix);
  const { rows: height, columns: width } = dimensions(matrix);
  const pivotColumns: number[] = [];
  let determinant = 1;
  let pivotRow = 0;

  for (let column = 0; column < width && pivotRow < height; column += 1) {
    // Pivot on the largest entry in the column, which keeps the arithmetic
    // stable when the natural pivot is small.
    let best = pivotRow;
    for (let row = pivotRow + 1; row < height; row += 1) {
      if (Math.abs(rows[row]![column]!) > Math.abs(rows[best]![column]!)) best = row;
    }

    if (Math.abs(rows[best]![column]!) <= tolerance) {
      determinant = 0;
      continue;
    }

    if (best !== pivotRow) {
      const swap = rows[best]!;
      rows[best] = rows[pivotRow]!;
      rows[pivotRow] = swap;
      determinant = -determinant;
    }

    const pivot = rows[pivotRow]![column]!;
    determinant *= pivot;
    pivotColumns.push(column);

    for (let row = pivotRow + 1; row < height; row += 1) {
      const factor = rows[row]![column]! / pivot;
      if (factor === 0) continue;
      for (let j = column; j < width; j += 1) {
        rows[row]![j] = rows[row]![j]! - factor * rows[pivotRow]![j]!;
      }
    }

    pivotRow += 1;
  }

  return { rows, determinant, pivotColumns };
}

export function determinant(matrix: Matrix): number {
  if (!isSquare(matrix)) return NaN;
  const { rows } = dimensions(matrix);
  // Small cases are exact and avoid pivoting noise entirely.
  if (rows === 1) return matrix[0]![0]!;
  if (rows === 2) {
    return matrix[0]![0]! * matrix[1]![1]! - matrix[0]![1]! * matrix[1]![0]!;
  }
  const result = eliminate(matrix, toleranceFor(matrix));
  return result.pivotColumns.length < rows ? 0 : result.determinant;
}

export function rank(matrix: Matrix): number {
  if (!isRectangular(matrix)) return 0;
  return eliminate(matrix, toleranceFor(matrix)).pivotColumns.length;
}

/** The inverse, or null when the matrix is singular. */
export function inverse(matrix: Matrix): number[][] | null {
  if (!isSquare(matrix)) return null;
  const size = matrix.length;
  const tolerance = toleranceFor(matrix);
  const working = matrix.map((row, i) => [...row, ...identity(size)[i]!]);

  for (let column = 0; column < size; column += 1) {
    let best = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(working[row]![column]!) > Math.abs(working[best]![column]!)) best = row;
    }
    if (Math.abs(working[best]![column]!) <= tolerance) return null;

    if (best !== column) {
      const swap = working[best]!;
      working[best] = working[column]!;
      working[column] = swap;
    }

    const pivot = working[column]![column]!;
    for (let j = 0; j < 2 * size; j += 1) {
      working[column]![j] = working[column]![j]! / pivot;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = working[row]![column]!;
      if (factor === 0) continue;
      for (let j = 0; j < 2 * size; j += 1) {
        working[row]![j] = working[row]![j]! - factor * working[column]![j]!;
      }
    }
  }

  return working.map((row) => row.slice(size));
}

/**
 * Solves A x = b, or returns null when the system has no single solution.
 * Back substitution on the eliminated system, so it costs a third of what
 * inverting and multiplying would.
 */
export function solve(matrix: Matrix, target: readonly number[]): number[] | null {
  if (!isSquare(matrix) || matrix.length !== target.length) return null;
  const size = matrix.length;
  const augmented = matrix.map((row, i) => [...row, target[i]!]);
  const tolerance = toleranceFor(matrix);
  const { rows, pivotColumns } = eliminate(augmented, tolerance);
  if (pivotColumns.length < size || pivotColumns.some((column) => column >= size)) return null;

  const solution = new Array<number>(size).fill(0);
  for (let row = size - 1; row >= 0; row -= 1) {
    let total = rows[row]![size]!;
    for (let column = row + 1; column < size; column += 1) {
      total -= rows[row]![column]! * solution[column]!;
    }
    const pivot = rows[row]![row]!;
    if (Math.abs(pivot) <= tolerance) return null;
    solution[row] = total / pivot;
  }
  return solution;
}

export interface Eigen {
  readonly values: readonly number[];
  /** One eigenvector per eigenvalue, in the same order. */
  readonly vectors: readonly (readonly number[])[];
}

/**
 * Real eigenvalues and eigenvectors.
 *
 * A symmetric matrix of any size is handled by the Jacobi rotation method,
 * which always converges and gives an orthogonal set of vectors. A general
 * 2x2 is solved analytically. Anything else, including a matrix whose
 * eigenvalues are complex, returns null rather than a plausible-looking
 * approximation.
 */
export function eigen(matrix: Matrix): Eigen | null {
  if (!isSquare(matrix)) return null;
  if (isSymmetric(matrix)) return jacobiEigen(matrix);
  if (matrix.length === 2) return eigen2x2(matrix);
  return null;
}

function eigen2x2(matrix: Matrix): Eigen | null {
  const a = matrix[0]![0]!;
  const b = matrix[0]![1]!;
  const c = matrix[1]![0]!;
  const d = matrix[1]![1]!;

  const trace = a + d;
  const discriminant = trace * trace - 4 * (a * d - b * c);
  if (discriminant < 0) return null;

  const root = Math.sqrt(discriminant);
  const values = [(trace + root) / 2, (trace - root) / 2];
  const vectors = values.map((value) => {
    // (A - lambda I) v = 0; either row gives the direction unless it vanishes.
    if (Math.abs(b) > Math.abs(c)) return normalise([b, value - a]);
    if (Math.abs(c) > 0) return normalise([value - d, c]);
    return value === a ? [1, 0] : [0, 1];
  });

  return { values, vectors };
}

const JACOBI_SWEEPS = 100;

function jacobiEigen(matrix: Matrix): Eigen {
  const size = matrix.length;
  const working = clone(matrix);
  let basis = identity(size);
  const tolerance = toleranceFor(matrix);

  for (let sweep = 0; sweep < JACOBI_SWEEPS; sweep += 1) {
    let largest = 0;
    let p = 0;
    let q = 1;
    for (let i = 0; i < size; i += 1) {
      for (let j = i + 1; j < size; j += 1) {
        if (Math.abs(working[i]![j]!) > largest) {
          largest = Math.abs(working[i]![j]!);
          p = i;
          q = j;
        }
      }
    }
    if (size < 2 || largest <= tolerance) break;

    // Rotate the plane (p, q) so that the off-diagonal entry becomes zero.
    const app = working[p]![p]!;
    const aqq = working[q]![q]!;
    const apq = working[p]![q]!;
    const theta = (aqq - app) / (2 * apq);
    const sign = theta >= 0 ? 1 : -1;
    const t = sign / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const cos = 1 / Math.sqrt(t * t + 1);
    const sin = t * cos;

    for (let k = 0; k < size; k += 1) {
      const akp = working[k]![p]!;
      const akq = working[k]![q]!;
      working[k]![p] = cos * akp - sin * akq;
      working[k]![q] = sin * akp + cos * akq;
    }
    for (let k = 0; k < size; k += 1) {
      const apk = working[p]![k]!;
      const aqk = working[q]![k]!;
      working[p]![k] = cos * apk - sin * aqk;
      working[q]![k] = sin * apk + cos * aqk;
    }
    basis = multiply(basis, rotation(size, p, q, cos, sin));
  }

  const values = working.map((row, i) => row[i]!);
  const vectors = transpose(basis).map((vector) => normalise(vector));

  // Largest eigenvalue first, which is what a reader expects to see.
  const order = values.map((_, index) => index).sort((a, b) => values[b]! - values[a]!);
  return {
    values: order.map((index) => values[index]!),
    vectors: order.map((index) => vectors[index]!),
  };
}

function rotation(size: number, p: number, q: number, cos: number, sin: number): number[][] {
  const result = identity(size);
  result[p]![p] = cos;
  result[q]![q] = cos;
  result[p]![q] = sin;
  result[q]![p] = -sin;
  return result;
}

function normalise(vector: readonly number[]): number[] {
  const length = Math.hypot(...vector);
  if (length === 0) return [...vector];
  const scaled = vector.map((entry) => entry / length);
  // Fix the sign so the same matrix always gives the same vectors back.
  const leading = scaled.find((entry) => Math.abs(entry) > 1e-12) ?? 1;
  return leading < 0 ? scaled.map((entry) => -entry) : scaled;
}
