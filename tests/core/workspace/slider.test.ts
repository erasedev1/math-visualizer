import { describe, expect, it } from 'vitest';
import {
  advanceSlider,
  DEFAULT_SLIDER,
  defaultSliderFor,
  formatSliderValue,
  normaliseSlider,
  sliderDecimals,
  snapToSlider,
  type SliderConfig,
} from '@/core/workspace/slider';

const config = (patch: Partial<SliderConfig> = {}): SliderConfig => ({
  ...DEFAULT_SLIDER,
  ...patch,
});

describe('defaultSliderFor', () => {
  it('uses the standard range for ordinary values', () => {
    expect(defaultSliderFor(2)).toEqual(DEFAULT_SLIDER);
    expect(defaultSliderFor(-7.5)).toEqual(DEFAULT_SLIDER);
  });

  it('widens the range to contain a large value', () => {
    const slider = defaultSliderFor(250);
    expect(slider.max).toBeGreaterThanOrEqual(250);
    expect(slider.min).toBe(-slider.max);
    expect(slider.step).toBeGreaterThan(0);
  });

  it('falls back to the standard range for a non-finite value', () => {
    expect(defaultSliderFor(Number.NaN)).toEqual(DEFAULT_SLIDER);
    expect(defaultSliderFor(Number.POSITIVE_INFINITY)).toEqual(DEFAULT_SLIDER);
  });
});

describe('normaliseSlider', () => {
  it('swaps reversed bounds', () => {
    const fixed = normaliseSlider(config({ min: 5, max: -5 }));
    expect(fixed.min).toBe(-5);
    expect(fixed.max).toBe(5);
  });

  it('replaces a non-positive or non-finite step', () => {
    expect(normaliseSlider(config({ step: 0 })).step).toBe(DEFAULT_SLIDER.step);
    expect(normaliseSlider(config({ step: -1 })).step).toBe(DEFAULT_SLIDER.step);
    expect(normaliseSlider(config({ step: Number.NaN })).step).toBe(DEFAULT_SLIDER.step);
  });

  it('never lets the step exceed the range', () => {
    expect(normaliseSlider(config({ min: 0, max: 1, step: 10 })).step).toBe(1);
  });

  it('replaces a non-positive speed', () => {
    expect(normaliseSlider(config({ speed: 0 })).speed).toBe(1);
  });
});

describe('snapToSlider', () => {
  it('snaps to the nearest step', () => {
    expect(snapToSlider(1.04, config({ step: 0.1 }))).toBe(1);
    expect(snapToSlider(1.06, config({ step: 0.1 }))).toBe(1.1);
    expect(snapToSlider(3.7, config({ step: 1 }))).toBe(4);
  });

  it('clamps to the range', () => {
    expect(snapToSlider(100, config())).toBe(10);
    expect(snapToSlider(-100, config())).toBe(-10);
  });

  it('stays on the grid measured from the minimum', () => {
    const slider = config({ min: 0.5, max: 3, step: 0.5 });
    expect(snapToSlider(1.3, slider)).toBe(1.5);
    expect(snapToSlider(0.6, slider)).toBe(0.5);
  });

  it('avoids floating-point dust', () => {
    expect(snapToSlider(0.30000000000000004, config({ step: 0.1 }))).toBe(0.3);
    expect(snapToSlider(0, config({ step: 0.1 }))).toBe(0);
    expect(Object.is(snapToSlider(0, config({ step: 0.1 })), -0)).toBe(false);
  });

  it('falls back to the minimum for a non-finite value', () => {
    expect(snapToSlider(Number.NaN, config())).toBe(-10);
  });
});

describe('advanceSlider', () => {
  it('moves forward at the configured rate', () => {
    // Speed 1 sweeps the whole range in four seconds.
    const { value } = advanceSlider(-10, config({ step: 0.01 }), 1);
    expect(value).toBeCloseTo(-5, 6);
  });

  it('scales with speed', () => {
    const slow = advanceSlider(-10, config({ step: 0.01, speed: 1 }), 1).value;
    const fast = advanceSlider(-10, config({ step: 0.01, speed: 2 }), 1).value;
    expect(fast - -10).toBeCloseTo(2 * (slow - -10), 6);
  });

  it('reverses at each end instead of jumping', () => {
    const atTop = advanceSlider(9.9, config({ step: 0.01, speed: 1 }), 1);
    expect(atTop.direction).toBe(-1);
    expect(atTop.value).toBeLessThanOrEqual(10);
    expect(atTop.value).toBeGreaterThan(-10);

    const atBottom = advanceSlider(-9.9, config({ step: 0.01, direction: -1 }), 1);
    expect(atBottom.direction).toBe(1);
    expect(atBottom.value).toBeGreaterThanOrEqual(-10);
  });

  it('stays inside the range even after a very long frame', () => {
    const { value } = advanceSlider(0, config({ step: 0.01 }), 1000);
    expect(value).toBeGreaterThanOrEqual(-10);
    expect(value).toBeLessThanOrEqual(10);
  });

  it('sweeps the full range over time without drifting out', () => {
    let value = -10;
    let direction: 1 | -1 = 1;
    let lowest = value;
    let highest = value;
    for (let frame = 0; frame < 600; frame += 1) {
      const next = advanceSlider(value, config({ step: 0.01, direction }), 1 / 60);
      value = next.value;
      direction = next.direction;
      lowest = Math.min(lowest, value);
      highest = Math.max(highest, value);
    }
    expect(lowest).toBeGreaterThanOrEqual(-10);
    expect(highest).toBeLessThanOrEqual(10);
    // Ten seconds at four seconds a sweep covers both ends.
    expect(highest).toBeCloseTo(10, 1);
    expect(lowest).toBeCloseTo(-10, 1);
  });

  it('does nothing for a zero-length range or a zero time step', () => {
    expect(advanceSlider(3, config({ min: 3, max: 3 }), 1).value).toBe(3);
    expect(advanceSlider(3, config(), 0).value).toBe(3);
  });
});

describe('formatSliderValue', () => {
  it('matches the precision of the step', () => {
    expect(formatSliderValue(1.23456, 0.1)).toBe('1.2');
    expect(formatSliderValue(1.23456, 0.01)).toBe('1.23');
    expect(formatSliderValue(3.7, 1)).toBe('4');
  });

  it('drops trailing zeros', () => {
    expect(formatSliderValue(2, 0.1)).toBe('2');
    expect(formatSliderValue(2.5, 0.01)).toBe('2.5');
  });

  it('re-reads as the same number', () => {
    for (const value of [-9.9, -0.1, 0, 0.3, 7.25]) {
      expect(Number(formatSliderValue(value, 0.01))).toBeCloseTo(value, 2);
    }
  });
});

describe('sliderDecimals', () => {
  it('derives decimals from the step', () => {
    expect(sliderDecimals(1)).toBe(0);
    expect(sliderDecimals(0.1)).toBe(1);
    expect(sliderDecimals(0.01)).toBe(2);
    expect(sliderDecimals(0.5)).toBe(1);
  });
});
