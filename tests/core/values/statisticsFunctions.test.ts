import { describe, expect, it } from 'vitest';
import { BUILTIN_FUNCTIONS } from '@/core/expression/functions';
import { parseExpression } from '@/core/expression/parser';
import { evaluateValue } from '@/core/values/evaluate';
import { VALUE_FUNCTION_LIST, VALUE_FUNCTIONS } from '@/core/values/functions';
import type { Value } from '@/core/values/types';

const isFunction = (name: string) => VALUE_FUNCTIONS.has(name) || BUILTIN_FUNCTIONS.has(name);

function evaluate(source: string, values: Record<string, Value> = {}): Value {
  return evaluateValue(parseExpression(source, { isFunction }), {
    values: new Map(Object.entries(values)),
  });
}

function scalar(source: string, values: Record<string, Value> = {}): number {
  const result = evaluate(source, values);
  if (result.kind !== 'number') throw new Error(`expected a number, got ${result.kind}`);
  return result.value;
}

const DATA = 'd = [2, 4, 4, 4, 5, 5, 7, 9]';

/** The sample above, bound so expressions can be written against a name. */
function withData(source: string): number {
  return scalar(source, { d: evaluate(DATA.slice(4)) });
}

describe('a sample can be written several ways', () => {
  it('reads a row of numbers', () => {
    expect(withData('mean(d)')).toBe(5);
    expect(withData('count(d)')).toBe(8);
  });

  it('reads the numbers written out directly', () => {
    expect(scalar('mean(1, 2, 3)')).toBe(2);
    expect(scalar('count(1, 2, 3)')).toBe(3);
    expect(scalar('mean(7)')).toBe(7);
  });

  it('reads a vector', () => {
    expect(scalar('mean(<1, 2, 6>)')).toBe(3);
  });

  it('reads a matrix row by row, so its shape does not matter', () => {
    expect(scalar('mean([[1, 2], [3, 4]])')).toBe(2.5);
    expect(scalar('sum([[1, 2], [3, 4]])')).toBe(10);
  });

  it('names the kind it cannot read', () => {
    expect(() => evaluate('mean(A)', { A: evaluate('(1, 2)') })).toThrow(/got a point/);
  });
});

describe('descriptive statistics', () => {
  it('reports centres', () => {
    expect(withData('median(d)')).toBe(4.5);
    expect(withData('mode(d)')).toBe(4);
  });

  it('reports spread', () => {
    expect(withData('variancep(d)')).toBe(4);
    expect(withData('stddevp(d)')).toBe(2);
    expect(withData('variance(d)')).toBeCloseTo(32 / 7, 12);
    expect(withData('stddev(d)')).toBeCloseTo(Math.sqrt(32 / 7), 12);
  });

  it('reports extremes and ranges', () => {
    expect(withData('min(d)')).toBe(2);
    expect(withData('max(d)')).toBe(9);
    expect(withData('range(d)')).toBe(7);
    expect(withData('iqr(d)')).toBe(1.5);
  });

  it('still takes min and max of loose numbers, as the plotter does', () => {
    expect(scalar('min(3, 1, 2)')).toBe(1);
    expect(scalar('max(3, 1, 2)')).toBe(3);
  });

  it('takes quantiles between 0 and 1', () => {
    expect(withData('quantile(d, 0)')).toBe(2);
    expect(withData('quantile(d, 0.5)')).toBe(withData('median(d)'));
    expect(withData('quantile(d, 1)')).toBe(9);
  });

  it('refuses a quantile outside the data', () => {
    expect(() => withData('quantile(d, 1.5)')).toThrow(/between 0 and 1/);
  });

  it('composes with the rest of the language', () => {
    expect(withData('(max(d) - min(d)) / 2')).toBe(3.5);
    expect(withData('mean(d) + 2 stddevp(d)')).toBe(9);
  });
});

describe('refusals', () => {
  it('will not measure a sample spread of one observation', () => {
    expect(() => scalar('stddev(4)')).toThrow(/at least two observations/);
    expect(() => scalar('variance(4)')).toThrow(/at least two observations/);
  });

  it('says there is no mode when nothing repeats', () => {
    expect(() => scalar('mode(1, 2, 3)')).toThrow(/occurs once/);
  });

  it('names the tie rather than picking one of it', () => {
    expect(() => scalar('mode(1, 1, 2, 2)')).toThrow(/no single mode: 1, 2/);
  });
});

describe('two samples', () => {
  const PAIR = { xs: 'xs = [1, 2, 3, 4, 5]', ys: 'ys = [2, 4, 5, 4, 5]' };

  function paired(source: string): number {
    return scalar(source, {
      xs: evaluate(PAIR.xs.slice(5)),
      ys: evaluate(PAIR.ys.slice(5)),
    });
  }

  it('correlates and covaries', () => {
    expect(paired('covariance(xs, ys)')).toBeCloseTo(1.5, 12);
    expect(paired('correlation(xs, ys)')).toBeCloseTo(1.5 / Math.sqrt(2.5 * 1.5), 12);
  });

  it('accepts a matrix of two rows, as the canvas already reads points', () => {
    expect(scalar('correlation([[1, 2, 3], [2, 4, 6]])')).toBeCloseTo(1, 12);
    expect(scalar('covariance([[1, 2, 3], [2, 4, 6]])')).toBeCloseTo(2, 12);
  });

  it('insists the two samples line up', () => {
    expect(() => scalar('correlation([1, 2, 3], [1, 2])')).toThrow(/3 and 2/);
    expect(() => scalar('correlation([1], [2])')).toThrow(/at least two points/);
  });

  it('asks for two rows when given one matrix', () => {
    expect(() => scalar('correlation([[1, 2], [3, 4], [5, 6]])')).toThrow(/matrix of two rows/);
  });

  it('refuses a correlation with a sample that never varies', () => {
    expect(() => scalar('correlation([1, 2, 3], [4, 4, 4])')).toThrow(/never varies/);
  });
});

describe('fit', () => {
  it('returns a line whose slope and intercept read back exactly', () => {
    const fitted = evaluate('fit([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])');
    expect(fitted.kind).toBe('line');
    expect(scalar('slope(fit([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]))')).toBeCloseTo(0.6, 12);
    expect(scalar('intercept(fit([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]))')).toBeCloseTo(2.2, 12);
  });

  it('is drawn as an infinite line, not a segment between two data points', () => {
    const fitted = evaluate('fit([1, 2, 3], [1, 2, 3])');
    expect(fitted.kind === 'line' && fitted.form).toBe('line');
  });

  it('scores the line it found', () => {
    expect(scalar('rsquared([1, 2, 3], [1, 2, 3])')).toBeCloseTo(1, 12);
    const r = scalar('correlation([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])');
    expect(scalar('rsquared([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])')).toBeCloseTo(r * r, 12);
  });

  it('refuses a vertical stack of points', () => {
    expect(() => evaluate('fit([2, 2, 2], [1, 2, 3])')).toThrow(/vertical/);
    expect(() => evaluate('rsquared([2, 2, 2], [1, 2, 3])')).toThrow(/no line to score/);
  });

  it('has nothing to score when every y is the same', () => {
    expect(() => evaluate('rsquared([1, 2, 3], [4, 4, 4])')).toThrow(/no variation/);
  });
});

describe('reading a line back', () => {
  it('reads slope and intercept off any line, ray or segment', () => {
    expect(scalar('slope(line((0, 1), (2, 5)))')).toBe(2);
    expect(scalar('intercept(line((0, 1), (2, 5)))')).toBe(1);
    expect(scalar('slope(segment((1, 1), (3, 2)))')).toBe(0.5);
    expect(scalar('intercept(ray((1, 1), (3, 2)))')).toBe(0.5);
  });

  it('refuses a vertical line rather than reporting infinity', () => {
    expect(() => scalar('slope(line((2, 0), (2, 5)))')).toThrow(/no slope/);
    expect(() => scalar('intercept(line((2, 0), (2, 5)))')).toThrow(/vertical/);
  });

  it('names what it was given instead of a line', () => {
    expect(() => scalar('slope(3)')).toThrow(/got a number/);
  });
});

describe('the registry the reference is generated from', () => {
  it('gives every function a group to be listed under', () => {
    for (const definition of VALUE_FUNCTION_LIST) {
      expect(definition.group ?? 'Geometry').toMatch(/^(Geometry|Statistics)$/);
    }
  });

  it('files the statistics under Statistics', () => {
    const statistics = VALUE_FUNCTION_LIST.filter((d) => d.group === 'Statistics').map((d) => d.name);
    expect(statistics).toContain('mean');
    expect(statistics).toContain('fit');
    expect(statistics).not.toContain('midpoint');
  });

  it('defines each name once', () => {
    const names = VALUE_FUNCTION_LIST.map((definition) => definition.name);
    expect(new Set(names).size).toBe(names.length);
  });

  /**
   * The reference hides a numeric entry whose name a value function also
   * defines, on the grounds that the value entry describes the wider case. If
   * a value entry were ever the narrower of the two, that would quietly hide a
   * function that works.
   */
  it('never shadows a numeric function with a narrower one', () => {
    for (const numeric of BUILTIN_FUNCTIONS.values()) {
      const shadowing = VALUE_FUNCTIONS.get(numeric.name);
      if (shadowing === undefined) continue;
      expect(shadowing.minArgs).toBeLessThanOrEqual(numeric.minArgs);
      expect(shadowing.maxArgs).toBeGreaterThanOrEqual(numeric.maxArgs);
    }
  });

  it('agrees with the numeric registry wherever both define a name', () => {
    // The plot path compiles against the numeric registry and the value path
    // against this one, so a shared name must mean the same thing on both.
    expect(scalar('min(4, 2, 7)')).toBe(Math.min(4, 2, 7));
    expect(scalar('max(4, 2, 7)')).toBe(Math.max(4, 2, 7));
  });
});
