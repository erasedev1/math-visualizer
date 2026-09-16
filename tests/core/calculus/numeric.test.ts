import { describe, expect, it } from 'vitest';
import { findExtremum, findRoot, integrate } from '@/core/calculus/numeric';

describe('integrate', () => {
  it('matches integrals known in closed form', () => {
    expect(integrate((x) => x ** 2, 0, 3)).toBeCloseTo(9, 9);
    expect(integrate(Math.sin, 0, Math.PI)).toBeCloseTo(2, 9);
    expect(integrate((x) => 1 / x, 1, Math.E)).toBeCloseTo(1, 9);
    expect(integrate(Math.exp, 0, 1)).toBeCloseTo(Math.E - 1, 9);
    // The Gaussian over the range that holds essentially all of it.
    expect(integrate((x) => Math.exp(-(x ** 2)), -8, 8)).toBeCloseTo(Math.sqrt(Math.PI), 9);
    expect(integrate((x) => 1 / (1 + x ** 2), -1, 1)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('integrates a high-degree polynomial exactly enough', () => {
    // x^9 integrates to x^10/10, which is 102.4 over [0, 2].
    expect(integrate((x) => x ** 9, 0, 2)).toBeCloseTo(102.4, 8);
  });

  it('refines where the curvature is', () => {
    // A uniform rule with a sane number of panels aliases this badly.
    expect(integrate((x) => Math.sin(40 * x), 0, Math.PI)).toBeCloseTo(0, 8);
    expect(integrate((x) => Math.exp(-100 * x ** 2), -1, 1)).toBeCloseTo(
      Math.sqrt(Math.PI / 100),
      9,
    );
  });

  it('reverses sign with the limits, and is zero over nothing', () => {
    expect(integrate((x) => x ** 2, 3, 0)).toBeCloseTo(-9, 9);
    expect(integrate(Math.sin, 2, 2)).toBe(0);
  });

  it('refuses limits that are not finite', () => {
    expect(() => integrate(Math.exp, 0, Infinity)).toThrow('finite limits');
  });

  it('refuses an integrand with a pole inside the interval', () => {
    expect(() => integrate((x) => 1 / x, -1, 1)).toThrow('not defined everywhere');
  });
});

describe('findRoot', () => {
  it('finds roots to full precision', () => {
    expect(findRoot((x) => x ** 2 - 2, 0, 2)).toBeCloseTo(Math.SQRT2, 12);
    expect(findRoot(Math.cos, 0, 3)).toBeCloseTo(Math.PI / 2, 12);
    expect(findRoot((x) => x ** 3 - x - 2, 1, 2)).toBeCloseTo(1.5213797068045676, 12);
    expect(findRoot((x) => Math.exp(x) - 5, 0, 5)).toBeCloseTo(Math.log(5), 12);
  });

  it('copes with a root the secant step alone would crawl towards', () => {
    // A flat approach: bisection is slow and pure secant slower still.
    expect(findRoot((x) => x ** 15, -1, 2)).toBeCloseTo(0, 9);
    expect(findRoot((x) => Math.atan(x) - 1, -10, 10)).toBeCloseTo(Math.tan(1), 12);
  });

  it('takes the limits in either order', () => {
    expect(findRoot((x) => x ** 2 - 2, 2, 0)).toBeCloseTo(Math.SQRT2, 12);
  });

  it('lands on a root of anything that changes sign across a wide bracket', () => {
    const cases: readonly (readonly [(x: number) => number, number, number])[] = [
      [(x) => x - 1e-9, -1000, 1000],
      [(x) => Math.exp(x) - 1, -50, 50],
      [(x) => Math.log(x) - 1, 1e-6, 1e6],
      [(x) => Math.tanh(x - 3), -100, 100],
      [(x) => 1 / (x - 2) + 1, 0, 1.5],
      [(x) => x ** 3 - 2 * x - 5, 2, 3],
      [(x) => Math.cos(x) - x, 0, 2],
      [(x) => x ** 2 - 1e-14, 0, 1],
    ];
    for (const [f, a, b] of cases) {
      const root = findRoot(f, a, b);
      expect(root).toBeGreaterThanOrEqual(Math.min(a, b));
      expect(root).toBeLessThanOrEqual(Math.max(a, b));
      // Either the residual vanishes, or the bracket has closed to nothing.
      expect(Math.abs(f(root))).toBeLessThan(1e-7);
    }
  });

  it('returns a limit that is already a root', () => {
    expect(findRoot((x) => x ** 2 - 4, 2, 5)).toBe(2);
    expect(findRoot((x) => x ** 2 - 4, -5, -2)).toBe(-2);
  });

  it('refuses a bracket that does not change sign', () => {
    expect(() => findRoot((x) => x ** 2 + 1, -1, 1)).toThrow('same sign');
    // Two roots inside: which one would it mean?
    expect(() => findRoot((x) => x ** 2 - 1, -2, 2)).toThrow('same sign');
  });

  it('refuses limits that are not finite', () => {
    expect(() => findRoot(Math.sin, -Infinity, 1)).toThrow('finite limits');
  });
});

describe('findExtremum', () => {
  it('finds a minimum and what it is worth', () => {
    const result = findExtremum((x) => (x - 2) ** 2 + 1, -5, 5, 'minimum');
    // Where it is can only be pinned to about the square root of machine
    // precision; what it is worth there is exact to the last bit, because
    // that is the same flatness seen from the other side.
    expect(result.x).toBeCloseTo(2, 7);
    expect(result.value).toBeCloseTo(1, 14);
  });

  it('finds a maximum', () => {
    const result = findExtremum(Math.sin, 0, Math.PI, 'maximum');
    expect(result.x).toBeCloseTo(Math.PI / 2, 7);
    expect(result.value).toBeCloseTo(1, 14);
  });

  it('finds the deepest of several dips', () => {
    // Two minima on this interval; the one near 4.71 is the lower.
    const result = findExtremum(Math.sin, 0, 8, 'minimum');
    expect(result.x).toBeCloseTo((3 * Math.PI) / 2, 7);
    expect(result.value).toBeCloseTo(-1, 14);
  });

  it('finds an extremum that sits at a limit', () => {
    const result = findExtremum((x) => x ** 3, -2, 2, 'maximum');
    expect(result.x).toBeCloseTo(2, 6);
    expect(result.value).toBeCloseTo(8, 6);
  });

  it('takes the limits in either order, and an empty interval', () => {
    expect(findExtremum(Math.sin, Math.PI, 0, 'maximum').x).toBeCloseTo(Math.PI / 2, 7);
    expect(findExtremum(Math.sin, 1, 1, 'minimum')).toEqual({ x: 1, value: Math.sin(1) });
  });

  it('refuses a function defined nowhere in the interval', () => {
    expect(() => findExtremum(() => NaN, 0, 1, 'minimum')).toThrow('not defined anywhere');
  });
});
