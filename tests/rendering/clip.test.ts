import { describe, expect, it } from 'vitest';
import { clipLine } from '@/rendering/2d/clip';

const view = { xMin: -10, xMax: 10, yMin: -5, yMax: 5 };
const P = (x: number, y: number) => ({ x, y });

describe('clipLine', () => {
  it('cuts an infinite horizontal line to the visible width', () => {
    const clipped = clipLine(P(0, 1), P(1, 1), 'line', view);
    expect(clipped).toEqual({ from: P(-10, 1), to: P(10, 1) });
  });

  it('cuts an infinite diagonal at the corner it leaves through', () => {
    const clipped = clipLine(P(0, 0), P(1, 1), 'line', view);
    expect(clipped?.from).toEqual(P(-5, -5));
    expect(clipped?.to).toEqual(P(5, 5));
  });

  it('keeps a ray from its start, not from the edge behind it', () => {
    const clipped = clipLine(P(0, 0), P(1, 0), 'ray', view);
    expect(clipped).toEqual({ from: P(0, 0), to: P(10, 0) });
  });

  it('leaves a segment inside the view untouched', () => {
    const clipped = clipLine(P(-2, -1), P(3, 2), 'segment', view);
    expect(clipped).toEqual({ from: P(-2, -1), to: P(3, 2) });
  });

  it('trims a segment that runs off the edge', () => {
    const clipped = clipLine(P(0, 0), P(40, 0), 'segment', view);
    expect(clipped).toEqual({ from: P(0, 0), to: P(10, 0) });
  });

  it('returns nothing for a line that misses the view entirely', () => {
    expect(clipLine(P(0, 20), P(1, 20), 'line', view)).toBeNull();
    expect(clipLine(P(50, 0), P(50, 1), 'line', view)).toBeNull();
  });

  it('returns nothing for a segment entirely outside the view', () => {
    expect(clipLine(P(20, 0), P(30, 0), 'segment', view)).toBeNull();
  });

  it('returns nothing for a ray pointing away from the view', () => {
    expect(clipLine(P(20, 0), P(30, 0), 'ray', view)).toBeNull();
  });

  it('keeps a ray that starts outside and enters the view', () => {
    const clipped = clipLine(P(-40, 0), P(-39, 0), 'ray', view);
    expect(clipped).toEqual({ from: P(-10, 0), to: P(10, 0) });
  });

  it('handles vertical lines, where the horizontal edges are parallel', () => {
    expect(clipLine(P(3, 0), P(3, 1), 'line', view)).toEqual({ from: P(3, -5), to: P(3, 5) });
  });

  it('returns nothing for a degenerate or non-finite line', () => {
    expect(clipLine(P(1, 1), P(1, 1), 'line', view)).toBeNull();
    expect(clipLine(P(0, 0), P(Number.NaN, 1), 'line', view)).toBeNull();
    expect(clipLine(P(Number.POSITIVE_INFINITY, 0), P(1, 1), 'segment', view)).toBeNull();
  });

  it('touches the corner of the view without failing', () => {
    // Passes exactly through (10, 5).
    const clipped = clipLine(P(0, 0), P(2, 1), 'line', view);
    expect(clipped?.to).toEqual(P(10, 5));
  });

  it('handles reversed bounds', () => {
    const reversed = { xMin: 10, xMax: -10, yMin: 5, yMax: -5 };
    expect(clipLine(P(0, 1), P(1, 1), 'line', reversed)).toEqual({
      from: P(-10, 1),
      to: P(10, 1),
    });
  });

  it('stays within the view for every direction', () => {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
      const clipped = clipLine(P(0, 0), P(Math.cos(angle), Math.sin(angle)), 'line', view);
      expect(clipped).not.toBeNull();
      for (const end of [clipped!.from, clipped!.to]) {
        expect(end.x).toBeGreaterThanOrEqual(view.xMin - 1e-9);
        expect(end.x).toBeLessThanOrEqual(view.xMax + 1e-9);
        expect(end.y).toBeGreaterThanOrEqual(view.yMin - 1e-9);
        expect(end.y).toBeLessThanOrEqual(view.yMax + 1e-9);
      }
    }
  });
});
