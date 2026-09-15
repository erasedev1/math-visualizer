import { describe, expect, it } from 'vitest';
import {
  bounds,
  createViewport,
  equaliseAxes,
  fitBounds,
  pan,
  resize,
  toScreen,
  toScreenX,
  toScreenY,
  toWorld,
  zoomAt,
  zoomCenter,
  MAX_SCALE,
  MIN_SCALE,
} from '@/rendering/2d/viewport';

const size = { width: 800, height: 400 };
const base = createViewport({ size, spanX: 20 });

describe('createViewport', () => {
  it('fits the requested horizontal span with equal axis scales', () => {
    expect(base.scale.x).toBe(40);
    expect(base.scale.y).toBe(40);
    const view = bounds(base);
    expect(view.xMin).toBe(-10);
    expect(view.xMax).toBe(10);
    // The shorter axis shows fewer units at the same scale.
    expect(view.yMin).toBe(-5);
    expect(view.yMax).toBe(5);
  });

  it('survives a zero-sized canvas during layout', () => {
    const degenerate = createViewport({ size: { width: 0, height: 0 } });
    expect(Number.isFinite(degenerate.scale.x)).toBe(true);
    expect(degenerate.scale.x).toBeGreaterThan(0);
  });
});

describe('coordinate transforms', () => {
  it('maps the origin to the canvas centre', () => {
    expect(toScreenX(base, 0)).toBe(400);
    expect(toScreenY(base, 0)).toBe(200);
  });

  it('flips the y axis', () => {
    expect(toScreenY(base, 1)).toBeLessThan(toScreenY(base, 0));
  });

  it('round-trips world to screen and back', () => {
    for (const point of [
      { x: 0, y: 0 },
      { x: 3.5, y: -2.25 },
      { x: -9.75, y: 4.5 },
    ]) {
      const back = toWorld(base, toScreen(base, point));
      expect(back.x).toBeCloseTo(point.x, 12);
      expect(back.y).toBeCloseTo(point.y, 12);
    }
  });
});

describe('pan', () => {
  it('moves the world opposite to the drag direction', () => {
    // Dragging the canvas right by 40px (one unit) reveals smaller x values.
    const panned = pan(base, 40, 0);
    expect(panned.center.x).toBeCloseTo(-1, 12);
    expect(panned.scale).toEqual(base.scale);
  });

  it('moves the world up when dragging down', () => {
    const panned = pan(base, 0, 40);
    expect(panned.center.y).toBeCloseTo(1, 12);
  });

  it('is reversible', () => {
    const there = pan(base, 137, -42);
    const back = pan(there, -137, 42);
    expect(back.center.x).toBeCloseTo(base.center.x, 12);
    expect(back.center.y).toBeCloseTo(base.center.y, 12);
  });
});

describe('zoomAt', () => {
  it('keeps the world point under the anchor fixed', () => {
    const anchor = { x: 700, y: 120 };
    const before = toWorld(base, anchor);
    const zoomed = zoomAt(base, anchor, 2);
    const after = toWorld(zoomed, anchor);
    expect(after.x).toBeCloseTo(before.x, 12);
    expect(after.y).toBeCloseTo(before.y, 12);
    expect(zoomed.scale.x).toBe(80);
  });

  it('halves the visible span when zooming in by two', () => {
    const zoomed = zoomCenter(base, 2);
    const view = bounds(zoomed);
    expect(view.xMax - view.xMin).toBeCloseTo(10, 12);
  });

  it('can zoom a single axis', () => {
    const zoomed = zoomCenter(base, 2, { axis: 'x' });
    expect(zoomed.scale.x).toBe(80);
    expect(zoomed.scale.y).toBe(40);
    expect(equaliseAxes(zoomed).scale.y).toBe(80);
  });

  it('clamps the scale instead of collapsing or overflowing', () => {
    let deep = base;
    for (let i = 0; i < 200; i += 1) deep = zoomCenter(deep, 10);
    expect(deep.scale.x).toBeLessThanOrEqual(MAX_SCALE);
    expect(Number.isFinite(bounds(deep).xMin)).toBe(true);

    let shallow = base;
    for (let i = 0; i < 200; i += 1) shallow = zoomCenter(shallow, 0.1);
    expect(shallow.scale.x).toBeGreaterThanOrEqual(MIN_SCALE);
  });

  it('ignores a non-positive factor', () => {
    expect(zoomCenter(base, 0)).toEqual(base);
    expect(zoomCenter(base, Number.NaN)).toEqual(base);
  });
});

describe('resize', () => {
  it('reveals more of the plane instead of stretching it', () => {
    const wider = resize(base, { width: 1600, height: 400 });
    expect(wider.scale).toEqual(base.scale);
    const view = bounds(wider);
    expect(view.xMin).toBe(-20);
    expect(view.xMax).toBe(20);
    expect(view.yMin).toBe(-5);
  });
});

describe('fitBounds', () => {
  it('centres and frames the requested region', () => {
    const fitted = fitBounds(base, { xMin: 0, xMax: 4, yMin: 0, yMax: 2 }, { padding: 0 });
    expect(fitted.center).toEqual({ x: 2, y: 1 });
    // Equal aspect is preserved, so the limiting axis sets the scale.
    expect(fitted.scale.x).toBe(fitted.scale.y);
    expect(fitted.scale.x).toBe(Math.min(800 / 4, 400 / 2));
  });

  it('can stretch axes independently when asked', () => {
    const fitted = fitBounds(
      base,
      { xMin: 0, xMax: 4, yMin: 0, yMax: 1 },
      { padding: 0, preserveAspect: false },
    );
    expect(fitted.scale.x).toBe(200);
    expect(fitted.scale.y).toBe(400);
  });

  it('keeps the current scale for a degenerate region', () => {
    const fitted = fitBounds(base, { xMin: 1, xMax: 1, yMin: 1, yMax: 1 });
    expect(Number.isFinite(fitted.scale.x)).toBe(true);
    expect(fitted.center).toEqual({ x: 1, y: 1 });
  });
});
