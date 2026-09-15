import { describe, expect, it } from 'vitest';
import { evaluateValue } from '@/core/values/evaluate';
import { parseExpression } from '@/core/expression/parser';
import { VALUE_FUNCTIONS } from '@/core/values/functions';
import { BUILTIN_FUNCTIONS } from '@/core/expression/functions';
import { point, type Value } from '@/core/values/types';

const isFunction = (name: string) => VALUE_FUNCTIONS.has(name) || BUILTIN_FUNCTIONS.has(name);

function evaluate(source: string, values: Record<string, Value> = {}): Value {
  return evaluateValue(parseExpression(source, { isFunction }), {
    values: new Map(Object.entries(values)),
  });
}

function expectPoint(source: string, values: Record<string, Value> = {}) {
  const result = evaluate(source, values);
  if (result.kind !== 'point') throw new Error(`expected a point, got ${result.kind}`);
  return result;
}

function expectNumber(source: string, values: Record<string, Value> = {}): number {
  const result = evaluate(source, values);
  if (result.kind !== 'number') throw new Error(`expected a number, got ${result.kind}`);
  return result.value;
}

const A = point(0, 0);
const B = point(4, 2);
const C = point(0, 6);

describe('evaluateValue', () => {
  it('still evaluates ordinary arithmetic', () => {
    expect(expectNumber('2 + 3 * 4')).toBe(14);
    expect(expectNumber('sin(pi/2)')).toBeCloseTo(1, 15);
    expect(expectNumber('2^10')).toBe(1024);
  });

  it('reads a coordinate pair as a point', () => {
    expect(expectPoint('(3, 4)')).toEqual(point(3, 4));
    expect(expectPoint('(1 + 1, 2 * 3)')).toEqual(point(2, 6));
  });

  it('keeps a single parenthesised expression as grouping', () => {
    expect(expectNumber('(2 + 3) * 2')).toBe(10);
  });

  it('rejects a tuple that is not a pair', () => {
    expect(() => evaluate('(1, 2, 3)')).toThrow(/two coordinates/);
  });

  it('rejects a point used as a coordinate', () => {
    expect(() => evaluate('((1, 2), 3)')).toThrow(/Expected a number/);
  });

  it('adds, subtracts and scales points', () => {
    expect(expectPoint('A + B', { A, B })).toEqual(point(4, 2));
    expect(expectPoint('B - A', { A, B })).toEqual(point(4, 2));
    expect(expectPoint('2 B', { B })).toEqual(point(8, 4));
    expect(expectPoint('B / 2', { B })).toEqual(point(2, 1));
    expect(expectPoint('-B', { B })).toEqual(point(-4, -2));
  });

  it('lets a midpoint be written as arithmetic or as a function', () => {
    const byArithmetic = expectPoint('(A + B)/2', { A, B });
    const byFunction = expectPoint('midpoint(A, B)', { A, B });
    expect(byArithmetic).toEqual(byFunction);
  });

  it('refuses arithmetic that has no meaning, naming both kinds', () => {
    expect(() => evaluate('A * B', { A, B })).toThrow(/multiply a point and a point/);
    expect(() => evaluate('A ^ 2', { A })).toThrow(/raise a point and a number/);
    expect(() => evaluate('2 / A', { A })).toThrow(/divide a number and a point/);
    expect(() => evaluate('A + 1', { A })).toThrow(/add a point and a number/);
  });

  it('builds the geometric constructions', () => {
    expect(expectNumber('distance(A, B)', { A, B })).toBeCloseTo(Math.hypot(4, 2), 12);
    expect(expectPoint('midpoint(A, C)', { A, C })).toEqual(point(0, 3));
    expect(expectNumber('angle(B, A, C)', { A, B, C })).toBeCloseTo(
      Math.PI / 2 - Math.atan2(2, 4),
      12,
    );

    const segment = evaluate('segment(A, B)', { A, B });
    expect(segment.kind === 'line' && segment.form).toBe('segment');
    const ray = evaluate('ray(A, B)', { A, B });
    expect(ray.kind === 'line' && ray.form).toBe('ray');
  });

  it('builds a circle from a radius or from a point on it', () => {
    const byRadius = evaluate('circle(A, 5)', { A });
    expect(byRadius.kind === 'circle' && byRadius.radius).toBe(5);
    const byPoint = evaluate('circle(A, (3, 4))', { A });
    expect(byPoint.kind === 'circle' && byPoint.radius).toBe(5);
  });

  it('intersects lines and refuses parallel ones', () => {
    expect(expectPoint('intersect(line((0,0), (1,0)), line((2,-1), (2,1)))')).toEqual(point(2, 0));
    expect(() => evaluate('intersect(line((0,0), (1,0)), line((0,1), (1,1)))')).toThrow(/parallel/);
  });

  it('respects the extent of segments when intersecting', () => {
    // The lines cross at (2, 0), which is beyond the end of this segment.
    expect(() =>
      evaluate('intersect(segment((0,0), (1,0)), line((2,-1), (2,1)))'),
    ).toThrow(/outside the part that is drawn/);
  });

  it('constructs perpendicular and parallel lines through a point', () => {
    const perpendicular = evaluate('perpendicular(line((0,0), (1,0)), (3, 5))');
    expect(perpendicular.kind === 'line' && perpendicular.from).toEqual({ x: 3, y: 5 });
    expect(expectPoint('intersect(line((0,0), (1,0)), perpendicular(line((0,0), (1,0)), (3, 5)))'))
      .toEqual(point(3, 0));
  });

  it('measures polygons and circles', () => {
    expect(expectNumber('area(polygon((0,0), (4,0), (0,3)))')).toBeCloseTo(6, 12);
    expect(expectNumber('perimeter(polygon((0,0), (1,0), (1,1), (0,1)))')).toBeCloseTo(4, 12);
    expect(expectNumber('area(circle((0,0), 2))')).toBeCloseTo(4 * Math.PI, 12);
    expect(expectNumber('perimeter(circle((0,0), 2))')).toBeCloseTo(4 * Math.PI, 12);
  });

  it('composes constructions, which is the point of the whole thing', () => {
    // The perpendicular bisector of AB meets AB at its midpoint.
    const values = { A, B };
    const foot = expectPoint(
      'intersect(line(A, B), perpendicular(line(A, B), midpoint(A, B)))',
      values,
    );
    expect(foot.x).toBeCloseTo(2, 12);
    expect(foot.y).toBeCloseTo(1, 12);
  });

  it('reports wrong argument kinds by name', () => {
    expect(() => evaluate('midpoint(1, 2)')).toThrow(/midpoint expects a point as argument 1/);
    expect(() => evaluate('distance(A, 3)', { A })).toThrow(/argument 2/);
    expect(() => evaluate('perpendicular((0,0), (1,1))')).toThrow(/expects a line, ray or segment/);
    expect(() => evaluate('area((0,0))')).toThrow(/expects a polygon or a circle/);
  });

  it('checks arity', () => {
    expect(() => evaluate('midpoint(A)', { A })).toThrow(/takes 2 arguments/);
    expect(() => evaluate('polygon(A, B)', { A, B })).toThrow(/at least 3/);
  });

  it('reports unknown names and functions', () => {
    expect(() => evaluate('Q + 1')).toThrow(/Unknown name "Q"/);
    expect(() => evaluate('midpoint')).toThrow(/is a function/);
  });

  it('calls a numeric function supplied by the workspace', () => {
    const result = evaluateValue(parseExpression('f(3)', { isFunction: (n) => n === 'f' }), {
      callNumeric: (name, args) => (name === 'f' ? args[0]! * 2 : undefined),
    });
    expect(result).toEqual({ kind: 'number', value: 6 });
  });
});
