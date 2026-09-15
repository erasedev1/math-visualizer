import { describe, expect, it } from 'vitest';
import {
  axisTicks,
  formatTick,
  niceStep,
  tickScale,
  ticksInRange,
} from '@/rendering/2d/ticks';

describe('niceStep', () => {
  it('rounds up to the nearest 1, 2 or 5 times a power of ten', () => {
    expect(niceStep(1)).toBe(1);
    expect(niceStep(1.5)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(0.03)).toBeCloseTo(0.05, 12);
    expect(niceStep(230)).toBe(500);
  });

  it('falls back to 1 for degenerate input', () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-5)).toBe(1);
    expect(niceStep(Number.NaN)).toBe(1);
  });
});

describe('tickScale', () => {
  it('keeps labelled ticks near the target pixel spacing', () => {
    for (const pixelsPerUnit of [0.001, 0.37, 1, 40, 41, 512, 1e6]) {
      const { step } = tickScale(pixelsPerUnit, 90);
      const spacing = step * pixelsPerUnit;
      // The worst case is a raw spacing halfway between two candidates, which
      // is a factor of sqrt(5/2) ~ 1.58 away whichever one is chosen.
      expect(spacing).toBeGreaterThan(90 / 1.6);
      expect(spacing).toBeLessThan(90 * 1.6);
    }
  });

  it('prefers the nearest candidate rather than always rounding up', () => {
    // At 41 px per unit a step of 5 would space labels 205 px apart; 2 is a
    // much better fit for a 90 px target.
    expect(tickScale(41, 90).step).toBe(2);
  });

  it('subdivides each step into whole minor divisions', () => {
    for (const pixelsPerUnit of [1, 40, 250]) {
      const { step, minorStep } = tickScale(pixelsPerUnit);
      const divisions = step / minorStep;
      expect(divisions).toBeCloseTo(Math.round(divisions), 9);
      expect(divisions).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('ticksInRange', () => {
  it('lists multiples of the step covering the range', () => {
    expect(ticksInRange(-2, 2, 1)).toEqual([-2, -1, 0, 1, 2]);
    expect(ticksInRange(0.5, 2.5, 0.5)).toEqual([0.5, 1, 1.5, 2, 2.5]);
  });

  it('avoids floating-point dust', () => {
    expect(ticksInRange(0, 1, 0.1)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  });

  it('handles reversed and degenerate ranges', () => {
    expect(ticksInRange(2, -2, 1)).toEqual([-2, -1, 0, 1, 2]);
    expect(ticksInRange(0, 0, 1)).toEqual([0]);
    expect(ticksInRange(0, 1, 0)).toEqual([]);
    // An absurd count is refused rather than allocated.
    expect(ticksInRange(0, 1e9, 1)).toEqual([]);
  });
});

describe('axisTicks', () => {
  it('returns major ticks, minor ticks and a label precision', () => {
    const ticks = axisTicks(-10, 10, 40);
    expect(ticks.major).toContain(0);
    // At 40 px per unit and a 90 px target, the chosen step is 2.
    expect(ticks.step).toBe(2);
    expect(ticks.major).toEqual([-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10]);
    expect(ticks.decimals).toBe(0);
    // Minor ticks never duplicate a major tick.
    for (const value of ticks.minor) expect(ticks.major).not.toContain(value);
  });

  it('increases label precision as the view zooms in', () => {
    expect(axisTicks(-0.01, 0.01, 40000).decimals).toBeGreaterThan(0);
  });
});

describe('formatTick', () => {
  it('prints zero plainly', () => {
    expect(formatTick(0, 3)).toBe('0');
  });

  it('uses the requested number of decimals', () => {
    expect(formatTick(0.5, 1)).toBe('0.5');
    expect(formatTick(2, 0)).toBe('2');
    expect(formatTick(-1.25, 2)).toBe('-1.25');
  });

  it('switches to exponent notation for extreme magnitudes', () => {
    expect(formatTick(1.5e7, 0)).toMatch(/e/);
    expect(formatTick(2e-7, 8)).toMatch(/e/);
  });

  it('distinguishes adjacent labels at every zoom level', () => {
    for (const pixelsPerUnit of [0.01, 1, 40, 1e4, 1e7]) {
      const ticks = axisTicks(-1 / pixelsPerUnit, 1 / pixelsPerUnit, pixelsPerUnit);
      const labels = ticks.major.map((value) => formatTick(value, ticks.decimals));
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});
