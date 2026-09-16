/**
 * Descriptive statistics and least squares on plain arrays of numbers.
 *
 * No knowledge of expressions, values or the workspace, so every routine can
 * be checked directly against a closed form. The rule throughout is the
 * conventional estimator written the conventional way, and a refusal —
 * reported by the caller — wherever the conventional answer does not exist:
 * a variance needs two observations, a correlation needs both samples to
 * vary, and a fit needs the x values not to be all the same.
 */

/** Sample or population: the n - 1 or n in the denominator of a variance. */
export type Spread = 'sample' | 'population';

export function sum(data: readonly number[]): number {
  return data.reduce((total, value) => total + value, 0);
}

export function mean(data: readonly number[]): number {
  return sum(data) / data.length;
}

export function smallest(data: readonly number[]): number {
  return Math.min(...data);
}

export function largest(data: readonly number[]): number {
  return Math.max(...data);
}

/**
 * The sum of squared deviations from the mean, computed in two passes.
 *
 * The one-pass `E[x^2] - E[x]^2` shortcut subtracts two large nearly-equal
 * numbers and can return a negative variance for data far from zero, so the
 * mean is found first and the deviations are squared against it.
 */
export function sumOfSquares(data: readonly number[]): number {
  const centre = mean(data);
  return data.reduce((total, value) => total + (value - centre) ** 2, 0);
}

/** Divisor for a spread over n observations, or null when it does not exist. */
function divisor(n: number, spread: Spread): number | null {
  const denominator = spread === 'sample' ? n - 1 : n;
  return denominator > 0 ? denominator : null;
}

export function variance(data: readonly number[], spread: Spread = 'sample'): number | null {
  const denominator = divisor(data.length, spread);
  return denominator === null ? null : sumOfSquares(data) / denominator;
}

export function standardDeviation(
  data: readonly number[],
  spread: Spread = 'sample',
): number | null {
  const spreadOut = variance(data, spread);
  return spreadOut === null ? null : Math.sqrt(spreadOut);
}

/**
 * The p-th quantile by linear interpolation between order statistics, which
 * is what R, NumPy and spreadsheet `PERCENTILE` all mean by the word. `p` runs
 * from 0 to 1, so `quantile(data, 0.5)` is the median.
 */
export function quantile(data: readonly number[], p: number): number {
  const sorted = [...data].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  if (below === above) return sorted[below]!;
  // Weighted by how far the position sits between the two neighbours.
  return sorted[below]! + (position - below) * (sorted[above]! - sorted[below]!);
}

export function median(data: readonly number[]): number {
  return quantile(data, 0.5);
}

/** The interquartile range, the width of the middle half of the data. */
export function interquartileRange(data: readonly number[]): number {
  return quantile(data, 0.75) - quantile(data, 0.25);
}

/**
 * Every most-frequent value, in ascending order.
 *
 * All of them rather than one, because which of a tie to prefer is not a
 * question statistics answers; the caller decides what to do with a tie.
 */
export function modes(data: readonly number[]): number[] {
  const counts = new Map<number, number>();
  for (const value of data) counts.set(value, (counts.get(value) ?? 0) + 1);
  const highest = Math.max(...counts.values());
  return [...counts.entries()]
    .filter(([, count]) => count === highest)
    .map(([value]) => value)
    .sort((a, b) => a - b);
}

/** How often the most common value occurs. */
export function highestFrequency(data: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const value of data) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Math.max(...counts.values());
}

/** The sum of the products of the two samples' deviations from their means. */
export function sumOfProducts(xs: readonly number[], ys: readonly number[]): number {
  const centreX = mean(xs);
  const centreY = mean(ys);
  return xs.reduce((total, x, index) => total + (x - centreX) * (ys[index]! - centreY), 0);
}

export function covariance(
  xs: readonly number[],
  ys: readonly number[],
  spread: Spread = 'sample',
): number | null {
  const denominator = divisor(xs.length, spread);
  return denominator === null ? null : sumOfProducts(xs, ys) / denominator;
}

/**
 * Pearson's correlation coefficient, or null when one of the samples is
 * constant. A sample that never varies has no direction to agree with, so the
 * usual formula divides by zero rather than reporting independence.
 */
export function correlation(xs: readonly number[], ys: readonly number[]): number | null {
  const spreadX = sumOfSquares(xs);
  const spreadY = sumOfSquares(ys);
  if (spreadX === 0 || spreadY === 0) return null;
  const r = sumOfProducts(xs, ys) / Math.sqrt(spreadX * spreadY);
  // Rounding can push a perfect correlation just outside [-1, 1].
  return Math.min(1, Math.max(-1, r));
}

export interface Fit {
  readonly slope: number;
  readonly intercept: number;
}

/**
 * The least-squares line y = slope x + intercept.
 *
 * Null when every x is the same: the best line through a vertical stack of
 * points is vertical, which is not a function of x and has no slope to report.
 */
export function leastSquares(xs: readonly number[], ys: readonly number[]): Fit | null {
  const spreadX = sumOfSquares(xs);
  if (spreadX === 0) return null;
  const slope = sumOfProducts(xs, ys) / spreadX;
  return { slope, intercept: mean(ys) - slope * mean(xs) };
}

/**
 * The fraction of the variation in y the line accounts for.
 *
 * For a least-squares line this is the square of the correlation, but it is
 * computed from the residuals so that it stays meaningful for a line that
 * came from somewhere else.
 */
export function coefficientOfDetermination(
  xs: readonly number[],
  ys: readonly number[],
  fit: Fit,
): number | null {
  const total = sumOfSquares(ys);
  if (total === 0) return null;
  const residual = ys.reduce(
    (running, y, index) => running + (y - (fit.slope * xs[index]! + fit.intercept)) ** 2,
    0,
  );
  return 1 - residual / total;
}
