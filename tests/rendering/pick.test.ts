import { describe, expect, it } from 'vitest';
import { pickPoint, PICK_RADIUS } from '@/rendering/2d/pick';
import type { SceneObject } from '@/rendering/2d/objects';
import { createViewport } from '@/rendering/2d/viewport';

const viewport = createViewport({ size: { width: 800, height: 400 }, spanX: 20 });
const style = { color: '#fff', width: 2 };

const pointAt = (id: string, x: number, y: number, movable = true): SceneObject => ({
  kind: 'point',
  id,
  at: { x, y },
  movable,
  style,
});

/** Screen position of a world point in the default viewport. */
const screen = (x: number, y: number) => ({ x: 400 + x * 40, y: 200 - y * 40 });

describe('pickPoint', () => {
  it('finds a point directly under the pointer', () => {
    expect(pickPoint([pointAt('A', 2, 1)], screen(2, 1), viewport)).toBe('A');
  });

  it('finds a point within the grab radius', () => {
    const near = screen(2, 1);
    expect(pickPoint([pointAt('A', 2, 1)], { x: near.x + 5, y: near.y + 5 }, viewport)).toBe('A');
  });

  it('ignores a point beyond the grab radius', () => {
    const near = screen(2, 1);
    const far = { x: near.x + PICK_RADIUS + 5, y: near.y };
    expect(pickPoint([pointAt('A', 2, 1)], far, viewport)).toBeNull();
  });

  it('measures the grab radius in pixels, not world units', () => {
    // Zoomed far out, two points a world unit apart are a pixel apart.
    const zoomedOut = createViewport({ size: { width: 800, height: 400 }, spanX: 800 });
    const at = { x: 400 + 2, y: 200 };
    expect(pickPoint([pointAt('A', 2, 0)], at, zoomedOut)).toBe('A');
  });

  it('ignores points that cannot be moved', () => {
    expect(pickPoint([pointAt('M', 2, 1, false)], screen(2, 1), viewport)).toBeNull();
  });

  it('ignores objects that are not points', () => {
    const objects: SceneObject[] = [
      { kind: 'circle', id: 'c', center: { x: 2, y: 1 }, radius: 1, style },
      { kind: 'line', id: 'l', form: 'line', from: { x: 0, y: 0 }, to: { x: 4, y: 2 }, style },
    ];
    expect(pickPoint(objects, screen(2, 1), viewport)).toBeNull();
  });

  it('prefers the nearest of several candidates', () => {
    const objects = [pointAt('A', 2, 1), pointAt('B', 2.1, 1)];
    expect(pickPoint(objects, screen(2, 1), viewport)).toBe('A');
    expect(pickPoint(objects, screen(2.1, 1), viewport)).toBe('B');
  });

  it('prefers the later definition when two points coincide', () => {
    const objects = [pointAt('A', 2, 1), pointAt('B', 2, 1)];
    expect(pickPoint(objects, screen(2, 1), viewport)).toBe('B');
  });

  it('returns null for an empty scene', () => {
    expect(pickPoint([], screen(0, 0), viewport)).toBeNull();
  });
});
