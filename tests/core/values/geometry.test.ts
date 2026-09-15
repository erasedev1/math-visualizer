import { describe, expect, it } from 'vitest';
import {
  angleAt,
  circleThrough,
  distance,
  intersectLines,
  midpoint,
  parallelThrough,
  perpendicularThrough,
  polygonArea,
  polygonPerimeter,
  projectOnto,
  withinForm,
} from '@/core/values/geometry';
import { line, point, polygon } from '@/core/values/types';

const P = (x: number, y: number) => ({ x, y });

describe('distance and midpoint', () => {
  it('matches the 3-4-5 triangle', () => {
    expect(distance(P(0, 0), P(3, 4))).toBe(5);
  });

  it('is symmetric and zero for one point', () => {
    expect(distance(P(2, 7), P(-3, 1))).toBeCloseTo(distance(P(-3, 1), P(2, 7)), 15);
    expect(distance(P(2, 7), P(2, 7))).toBe(0);
  });

  it('puts the midpoint equidistant from both ends', () => {
    const a = P(-2, 5);
    const b = P(6, 1);
    const m = midpoint(a, b);
    expect(m).toEqual({ x: 2, y: 3 });
    expect(distance(a, m)).toBeCloseTo(distance(b, m), 12);
  });
});

describe('angleAt', () => {
  it('measures a right angle', () => {
    expect(angleAt(P(0, 0), P(1, 0), P(0, 1))).toBeCloseTo(Math.PI / 2, 12);
  });

  it('measures a straight angle and a zero angle', () => {
    expect(angleAt(P(0, 0), P(1, 0), P(-1, 0))).toBeCloseTo(Math.PI, 12);
    expect(angleAt(P(0, 0), P(1, 0), P(2, 0))).toBeCloseTo(0, 12);
  });

  it('is unsigned, so argument order does not flip it', () => {
    const forwards = angleAt(P(0, 0), P(1, 0), P(1, 1));
    const backwards = angleAt(P(0, 0), P(1, 1), P(1, 0));
    expect(forwards).toBeCloseTo(Math.PI / 4, 12);
    expect(backwards).toBeCloseTo(forwards, 12);
  });

  it('keeps precision for very small angles', () => {
    // acos of a dot product would lose most of these digits.
    const tiny = angleAt(P(0, 0), P(1, 0), P(1, 1e-8));
    expect(tiny).toBeCloseTo(1e-8, 15);
  });

  it('sums to pi across a triangle', () => {
    const a = P(0, 0);
    const b = P(4, 0);
    const c = P(1, 3);
    const total = angleAt(a, b, c) + angleAt(b, a, c) + angleAt(c, a, b);
    expect(total).toBeCloseTo(Math.PI, 12);
  });
});

describe('parallel and perpendicular construction', () => {
  const base = line(P(0, 0), P(2, 1));

  it('passes through the given point', () => {
    expect(parallelThrough(base, P(5, -3)).from).toEqual(P(5, -3));
    expect(perpendicularThrough(base, P(5, -3)).from).toEqual(P(5, -3));
  });

  it('never meets the line it is parallel to', () => {
    const result = intersectLines(base, parallelThrough(base, P(0, 4)));
    expect(result.parallel).toBe(true);
    expect(result.point).toBeNull();
  });

  it('meets the original at a right angle', () => {
    const perpendicular = perpendicularThrough(base, P(3, 3));
    const meeting = intersectLines(base, perpendicular);
    expect(meeting.point).not.toBeNull();
    const foot = meeting.point!;
    expect(angleAt(foot, base.to, P(3, 3))).toBeCloseTo(Math.PI / 2, 12);
  });

  it('drops a perpendicular whose foot is the closest point on the line', () => {
    const target = P(3, 3);
    const foot = intersectLines(base, perpendicularThrough(base, target)).point!;
    expect(foot.x).toBeCloseTo(projectOnto(base, target).x, 12);
    expect(foot.y).toBeCloseTo(projectOnto(base, target).y, 12);
  });
});

describe('intersectLines', () => {
  it('finds the crossing point of two lines', () => {
    const meeting = intersectLines(line(P(-1, 0), P(1, 0)), line(P(0, -1), P(0, 1)));
    expect(meeting.point).toEqual({ x: 0, y: 0 });
    expect(meeting.parallel).toBe(false);
  });

  it('reports where along each line the crossing falls', () => {
    const meeting = intersectLines(line(P(0, 0), P(4, 0)), line(P(1, -1), P(1, 1)));
    expect(meeting.alongFirst).toBeCloseTo(0.25, 12);
    expect(meeting.alongSecond).toBeCloseTo(0.5, 12);
  });

  it('treats collinear lines as parallel rather than picking a point', () => {
    const meeting = intersectLines(line(P(0, 0), P(1, 1)), line(P(2, 2), P(3, 3)));
    expect(meeting.parallel).toBe(true);
  });
});

describe('withinForm', () => {
  it('accepts anything on an infinite line', () => {
    expect(withinForm('line', -5)).toBe(true);
    expect(withinForm('line', 5)).toBe(true);
  });

  it('accepts only the forward half of a ray', () => {
    expect(withinForm('ray', 2)).toBe(true);
    expect(withinForm('ray', -0.001)).toBe(false);
  });

  it('accepts only between the ends of a segment', () => {
    expect(withinForm('segment', 0)).toBe(true);
    expect(withinForm('segment', 1)).toBe(true);
    expect(withinForm('segment', 1.001)).toBe(false);
    expect(withinForm('segment', -0.001)).toBe(false);
  });
});

describe('circles and polygons', () => {
  it('builds a circle through a point', () => {
    const shape = circleThrough(P(1, 1), P(4, 5));
    expect(shape.radius).toBe(5);
    expect(shape.center).toEqual(P(1, 1));
  });

  it('measures a unit square', () => {
    const square = polygon([P(0, 0), P(1, 0), P(1, 1), P(0, 1)]);
    expect(polygonArea(square)).toBeCloseTo(1, 12);
    expect(polygonPerimeter(square)).toBeCloseTo(4, 12);
  });

  it('measures a triangle', () => {
    expect(polygonArea(polygon([P(0, 0), P(4, 0), P(0, 3)]))).toBeCloseTo(6, 12);
  });

  it('gives the same area whichever way round the vertices go', () => {
    const forwards = polygon([P(0, 0), P(4, 0), P(0, 3)]);
    const backwards = polygon([P(0, 3), P(4, 0), P(0, 0)]);
    expect(polygonArea(backwards)).toBeCloseTo(polygonArea(forwards), 12);
  });

  it('measures a degenerate polygon as zero area', () => {
    expect(polygonArea(polygon([P(0, 0), P(1, 1), P(2, 2)]))).toBeCloseTo(0, 12);
  });
});

describe('projectOnto', () => {
  it('lands on the line and is closest to the target', () => {
    const base = line(P(0, 0), P(1, 0));
    expect(projectOnto(base, P(3, 7))).toEqual({ x: 3, y: 0 });
  });

  it('survives a degenerate line', () => {
    expect(projectOnto(line(P(2, 2), P(2, 2)), P(5, 5))).toEqual({ x: 2, y: 2 });
  });

  it('keeps a point already on the line where it is', () => {
    const base = line(P(1, 1), P(3, 5));
    const target = point(2, 3);
    const projected = projectOnto(base, target);
    expect(projected.x).toBeCloseTo(2, 12);
    expect(projected.y).toBeCloseTo(3, 12);
  });
});
