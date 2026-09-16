import { describe, expect, it } from 'vitest';
import {
  coefficientOfDetermination,
  correlation,
  covariance,
  highestFrequency,
  interquartileRange,
  largest,
  leastSquares,
  mean,
  median,
  modes,
  quantile,
  smallest,
  standardDeviation,
  sum,
  sumOfProducts,
  sumOfSquares,
  variance,
} from '@/core/values/statistics';

/** The worked example from every textbook: mean 5, sample variance 4. */
const SAMPLE = [2, 4, 4, 4, 5, 5, 7, 9];

describe('totals and centres', () => {
  it('sums and averages', () => {
    expect(sum(SAMPLE)).toBe(40);
    expect(mean(SAMPLE)).toBe(5);
    expect(sum([])).toBe(0);
  });

  it('finds the extremes', () => {
    expect(smallest(SAMPLE)).toBe(2);
    expect(largest(SAMPLE)).toBe(9);
  });

  it('takes the median of an even sample halfway between the middle two', () => {
    expect(median(SAMPLE)).toBe(4.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([7])).toBe(7);
  });

  it('does not depend on the order the data arrives in', () => {
    const shuffled = [9, 4, 5, 2, 7, 4, 5, 4];
    expect(median(shuffled)).toBe(median(SAMPLE));
    expect(mean(shuffled)).toBe(mean(SAMPLE));
  });
});

describe('spread', () => {
  it('divides by n - 1 for a sample and n for a population', () => {
    // Deviations from 5 are -3,-1,-1,-1,0,0,2,4, squaring to 32 in total.
    expect(sumOfSquares(SAMPLE)).toBe(32);
    expect(variance(SAMPLE, 'sample')).toBeCloseTo(32 / 7, 12);
    expect(variance(SAMPLE, 'population')).toBe(4);
    expect(standardDeviation(SAMPLE, 'population')).toBe(2);
  });

  it('defaults to the sample estimator', () => {
    expect(variance(SAMPLE)).toBe(variance(SAMPLE, 'sample'));
    expect(standardDeviation(SAMPLE)).toBe(standardDeviation(SAMPLE, 'sample'));
  });

  it('has no sample spread for a single observation', () => {
    expect(variance([3], 'sample')).toBeNull();
    expect(standardDeviation([3], 'sample')).toBeNull();
    expect(variance([3], 'population')).toBe(0);
  });

  it('is unshaken by data far from zero', () => {
    // The one-pass E[x^2] - E[x]^2 shortcut loses every significant digit here
    // and can even report a negative variance.
    const shifted = SAMPLE.map((value) => value + 1e9);
    expect(variance(shifted, 'population')).toBeCloseTo(4, 6);
  });

  it('measures the middle half with the interquartile range', () => {
    expect(quantile(SAMPLE, 0.25)).toBe(4);
    expect(quantile(SAMPLE, 0.75)).toBe(5.5);
    expect(interquartileRange(SAMPLE)).toBe(1.5);
  });
});

describe('quantiles', () => {
  const ordered = [1, 2, 3, 4];

  it('runs from the smallest to the largest observation', () => {
    expect(quantile(ordered, 0)).toBe(1);
    expect(quantile(ordered, 1)).toBe(4);
  });

  it('interpolates between neighbouring observations', () => {
    // Position 0.3 * 3 = 0.9, nine tenths of the way from 1 to 2.
    expect(quantile(ordered, 0.3)).toBeCloseTo(1.9, 12);
    expect(quantile(ordered, 0.5)).toBe(2.5);
  });

  it('agrees with the median it generalises', () => {
    expect(quantile(SAMPLE, 0.5)).toBe(median(SAMPLE));
  });
});

describe('modes', () => {
  it('finds the most common observation', () => {
    expect(modes(SAMPLE)).toEqual([4]);
    expect(highestFrequency(SAMPLE)).toBe(3);
  });

  it('reports every value of a tie, in order', () => {
    expect(modes([3, 1, 3, 1, 2])).toEqual([1, 3]);
  });

  it('reports a frequency of one when nothing repeats', () => {
    expect(highestFrequency([1, 2, 3])).toBe(1);
    expect(modes([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe('two samples together', () => {
  const xs = [1, 2, 3, 4, 5];
  const ys = [2, 4, 6, 8, 10];

  it('correlates a straight line perfectly', () => {
    expect(correlation(xs, ys)).toBe(1);
    expect(correlation(xs, [...ys].reverse())).toBe(-1);
  });

  it('covaries by the product of the deviations', () => {
    expect(sumOfProducts(xs, ys)).toBe(20);
    expect(covariance(xs, ys, 'sample')).toBe(5);
    expect(covariance(xs, ys, 'population')).toBe(4);
  });

  it('has no correlation when one sample never varies', () => {
    expect(correlation(xs, [1, 1, 1, 1, 1])).toBeNull();
    expect(correlation([2, 2, 2], [1, 2, 3])).toBeNull();
  });

  it('is symmetric in its arguments', () => {
    expect(correlation(ys, xs)).toBe(correlation(xs, ys));
    expect(covariance(ys, xs)).toBe(covariance(xs, ys));
  });
});

describe('least squares', () => {
  it('recovers a line that the data lies on exactly', () => {
    const xs = [0, 1, 2, 3];
    const fit = leastSquares(xs, xs.map((x) => 3 * x - 1));
    expect(fit?.slope).toBeCloseTo(3, 12);
    expect(fit?.intercept).toBeCloseTo(-1, 12);
    expect(coefficientOfDetermination(xs, xs.map((x) => 3 * x - 1), fit!)).toBeCloseTo(1, 12);
  });

  it('matches the closed form on scattered data', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 5, 4, 5];
    // Sxy = 6, Sxx = 10, so the slope is 0.6 and the line passes through the
    // means (3, 4).
    const fit = leastSquares(xs, ys)!;
    expect(fit.slope).toBeCloseTo(0.6, 12);
    expect(fit.intercept).toBeCloseTo(2.2, 12);
    expect(fit.slope * 3 + fit.intercept).toBeCloseTo(4, 12);
  });

  it('scores itself as the square of the correlation', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 5, 4, 5];
    const r = correlation(xs, ys)!;
    expect(coefficientOfDetermination(xs, ys, leastSquares(xs, ys)!)).toBeCloseTo(r * r, 12);
  });

  it('refuses a vertical stack of points', () => {
    expect(leastSquares([2, 2, 2], [1, 2, 3])).toBeNull();
  });

  it('has nothing to account for when every y is the same', () => {
    expect(coefficientOfDetermination([1, 2, 3], [4, 4, 4], { slope: 0, intercept: 4 })).toBeNull();
  });

  it('scores a poor line below zero', () => {
    // A line that is worse than simply guessing the mean every time.
    const xs = [1, 2, 3];
    const ys = [1, 2, 3];
    expect(coefficientOfDetermination(xs, ys, { slope: -1, intercept: 0 })!).toBeLessThan(0);
  });
});
