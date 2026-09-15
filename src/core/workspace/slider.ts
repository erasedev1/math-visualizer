import { formatNumber } from '../expression/print';

/**
 * Slider behaviour.
 *
 * A slider does not hold a value of its own: it writes the number back into
 * the expression that defines it, so the text stays the single source of
 * truth and a saved workspace keeps its slider positions for free. Everything
 * here is therefore a pure function over a value and a configuration.
 */

export interface SliderConfig {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly playing: boolean;
  /** Multiplier on the base sweep rate. */
  readonly speed: number;
  /** Direction of travel while animating. */
  readonly direction: 1 | -1;
}

/** Seconds a full sweep takes at speed 1. */
const BASE_SWEEP_SECONDS = 4;

export const DEFAULT_SLIDER: SliderConfig = {
  min: -10,
  max: 10,
  step: 0.1,
  playing: false,
  speed: 1,
  direction: 1,
};

/** Bounds that comfortably contain the value a variable already holds. */
export function defaultSliderFor(value: number): SliderConfig {
  if (!Number.isFinite(value)) return DEFAULT_SLIDER;

  const magnitude = Math.abs(value);
  if (magnitude <= 10) return DEFAULT_SLIDER;

  // Round out to a power of ten so the bounds look deliberate.
  const bound = Math.pow(10, Math.ceil(Math.log10(magnitude)));
  return { ...DEFAULT_SLIDER, min: -bound, max: bound, step: bound / 100 };
}

/** Keeps a configuration usable however it was edited. */
export function normaliseSlider(config: SliderConfig): SliderConfig {
  const min = Number.isFinite(config.min) ? config.min : DEFAULT_SLIDER.min;
  const max = Number.isFinite(config.max) ? config.max : DEFAULT_SLIDER.max;
  const ordered = min <= max ? { min, max } : { min: max, max: min };
  const span = ordered.max - ordered.min;
  const step =
    Number.isFinite(config.step) && config.step > 0
      ? Math.min(config.step, span > 0 ? span : config.step)
      : DEFAULT_SLIDER.step;
  const speed = Number.isFinite(config.speed) && config.speed > 0 ? config.speed : 1;
  return { ...config, ...ordered, step, speed };
}

/** Snaps a value to the slider's grid and range. */
export function snapToSlider(value: number, config: SliderConfig): number {
  const { min, max, step } = normaliseSlider(config);
  if (!Number.isFinite(value)) return min;
  const clamped = Math.min(max, Math.max(min, value));
  const steps = Math.round((clamped - min) / step);
  const snapped = min + steps * step;
  // Rounding can leave the value a hair outside the range or carrying
  // floating-point dust from the multiplication.
  return roundToStep(Math.min(max, Math.max(min, snapped)), step);
}

export interface SliderAdvance {
  readonly value: number;
  readonly direction: 1 | -1;
}

/**
 * Moves an animating slider on by `seconds`, reversing at each end so the
 * value sweeps back and forth instead of jumping.
 */
export function advanceSlider(
  value: number,
  config: SliderConfig,
  seconds: number,
): SliderAdvance {
  const { min, max, speed, direction } = normaliseSlider(config);
  const span = max - min;
  if (span <= 0 || !Number.isFinite(seconds) || seconds <= 0) {
    return { value: snapToSlider(value, config), direction };
  }

  const distance = (span / BASE_SWEEP_SECONDS) * speed * seconds;
  let position = (Number.isFinite(value) ? value : min) + distance * direction;
  let next = direction;

  // A long frame can overshoot by more than a full span; bounce until inside.
  for (let guard = 0; guard < 8 && (position > max || position < min); guard += 1) {
    if (position > max) {
      position = 2 * max - position;
      next = -1;
    } else {
      position = 2 * min - position;
      next = 1;
    }
  }

  return { value: snapToSlider(position, config), direction: next };
}

/** Decimal places implied by the step size. */
export function sliderDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 2;
  return Math.max(0, Math.min(10, -Math.floor(Math.log10(step) + 1e-9)));
}

function roundToStep(value: number, step: number): number {
  const decimals = sliderDecimals(step);
  const factor = Math.pow(10, Math.min(decimals + 2, 15));
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

/** Renders a slider value for writing back into the expression text. */
export function formatSliderValue(value: number, step: number): string {
  return formatNumber(Number(value.toFixed(sliderDecimals(step))));
}
