import { describe, expect, it } from 'vitest';
import { sampleFunction, type SampleOptions, type SampledCurve } from '@/rendering/2d/sampler';

/** A 800x400 view of [-10, 10] x [-5, 5], matching the default viewport. */
const view: SampleOptions = {
  xMin: -10,
  xMax: 10,
  yMin: -5,
  yMax: 5,
  pixelsPerUnitX: 40,
  pixelsPerUnitY: 40,
};

function points(curve: SampledCurve): { x: number; y: number }[] {
  return curve.segments.flatMap((segment) => {
    const result: { x: number; y: number }[] = [];
    for (let i = 0; i < segment.length; i += 2) {
      result.push({ x: segment[i]!, y: segment[i + 1]! });
    }
    return result;
  });
}

const pointCount = (curve: SampledCurve) =>
  curve.segments.reduce((total, segment) => total + segment.length / 2, 0);

describe('sampleFunction', () => {
  it('samples a straight line as one segment', () => {
    const curve = sampleFunction((x) => x, view);
    expect(curve.segments).toHaveLength(1);
    for (const point of points(curve)) {
      expect(point.y).toBeCloseTo(point.x, 12);
    }
  });

  it('spans the full requested domain', () => {
    const curve = sampleFunction((x) => x / 4, view);
    const all = points(curve);
    expect(all[0]?.x).toBeCloseTo(-10, 12);
    expect(all.at(-1)?.x).toBeCloseTo(10, 12);
  });

  it('emits x values in increasing order', () => {
    const curve = sampleFunction((x) => Math.sin(x) * 3, view);
    for (const segment of curve.segments) {
      for (let i = 2; i < segment.length; i += 2) {
        expect(segment[i]!).toBeGreaterThan(segment[i - 2]!);
      }
    }
  });

  it('samples every point on the curve, not near it', () => {
    const fn = (x: number) => Math.sin(x) * Math.exp(-x * x / 20);
    for (const point of points(sampleFunction(fn, view))) {
      expect(point.y).toBeCloseTo(fn(point.x), 9);
    }
  });

  it('refines where the curve bends and not where it is straight', () => {
    const line = sampleFunction((x) => 0.5 * x, view);
    const wiggle = sampleFunction((x) => 3 * Math.sin(20 * x), view);
    // Both start from the same uniform grid; only the wiggle needs refinement.
    expect(wiggle.evaluations).toBeGreaterThan(line.evaluations * 1.5);
  });

  it('resolves a high-frequency wave that a per-pixel grid would alias', () => {
    // sin(50x) has ~160 extrema in view; a plot that misses them looks wrong.
    const fn = (x: number) => 3 * Math.sin(50 * x);
    const curve = sampleFunction(fn, view);
    const all = points(curve);
    let peaks = 0;
    for (let i = 1; i < all.length - 1; i += 1) {
      const previous = all[i - 1]!.y;
      const current = all[i]!.y;
      const next = all[i + 1]!.y;
      if (current > previous && current > next && current > 2.7) peaks += 1;
    }
    expect(peaks).toBeGreaterThan(140);
  });

  it('breaks the curve where the function is undefined', () => {
    // sqrt(x) exists only for x >= 0, so nothing may be drawn to its left.
    const curve = sampleFunction(Math.sqrt, view);
    expect(curve.segments).toHaveLength(1);
    for (const point of points(curve)) {
      expect(point.x).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('brackets the edge of the domain closely', () => {
    const curve = sampleFunction(Math.log, view);
    const first = points(curve)[0];
    // ln(x) is undefined at 0; the first drawn point should sit just past it.
    expect(first?.x).toBeGreaterThan(0);
    expect(first?.x).toBeLessThan(0.01);
  });

  it('splits a curve at a pole instead of joining the branches', () => {
    const curve = sampleFunction((x) => 1 / x, view);
    expect(curve.segments.length).toBe(2);
    const [left, right] = curve.segments;
    // The left branch dives down, the right branch comes from above.
    expect(left!.at(-1)!).toBeLessThan(view.yMin);
    expect(right![1]!).toBeGreaterThan(view.yMax);
  });

  it('splits tan(x) at each of its poles in view', () => {
    const curve = sampleFunction(Math.tan, view);
    // tan has a pole at every odd multiple of pi/2, six of them in [-10, 10],
    // so the curve arrives in seven branches.
    expect(curve.segments.length).toBe(7);
  });

  it('keeps a step function in one piece but does not invent a gap', () => {
    const curve = sampleFunction((x) => (x < 0 ? -2 : 2), view);
    expect(curve.segments).toHaveLength(1);
  });

  it('bounds emitted coordinates near the viewport', () => {
    const curve = sampleFunction((x) => 1e12 * x, view);
    const height = view.yMax - view.yMin;
    for (const point of points(curve)) {
      expect(Math.abs(point.y)).toBeLessThanOrEqual(view.yMax + height * 4 + 1e-9);
    }
  });

  it('drops a curve that is undefined everywhere', () => {
    expect(sampleFunction(() => Number.NaN, view).segments).toHaveLength(0);
    expect(sampleFunction(() => Number.POSITIVE_INFINITY, view).segments).toHaveLength(0);
  });

  it('returns nothing for an empty or invalid domain', () => {
    expect(sampleFunction((x) => x, { ...view, xMin: 5, xMax: 5 }).segments).toHaveLength(0);
    expect(sampleFunction((x) => x, { ...view, xMin: 5, xMax: 1 }).segments).toHaveLength(0);
    expect(sampleFunction((x) => x, { ...view, xMin: Number.NaN }).segments).toHaveLength(0);
  });

  it('bounds the amount of work for a wide view', () => {
    const wide = sampleFunction(Math.sin, {
      ...view,
      xMin: -1e6,
      xMax: 1e6,
      pixelsPerUnitX: 4e-4,
    });
    expect(wide.evaluations).toBeLessThan(200000);
    expect(pointCount(wide)).toBeGreaterThan(100);
  });

  it('honours an explicit depth limit', () => {
    const shallow = sampleFunction((x) => 3 * Math.sin(20 * x), { ...view, maxDepth: 0 });
    const deep = sampleFunction((x) => 3 * Math.sin(20 * x), { ...view, maxDepth: 6 });
    expect(shallow.evaluations).toBeLessThan(deep.evaluations);
  });
});
