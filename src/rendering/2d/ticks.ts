/**
 * Axis tick generation.
 *
 * Steps are chosen from the 1-2-5 decade sequence so labels stay readable at
 * every zoom level, and label precision is derived from the step so that
 * neighbouring labels never print as the same string.
 */

export interface TickScale {
  /** Spacing between labelled ticks, in world units. */
  readonly step: number;
  /** Spacing between unlabelled grid lines, in world units. */
  readonly minorStep: number;
}

export interface AxisTicks extends TickScale {
  readonly major: readonly number[];
  readonly minor: readonly number[];
  /** Decimal places needed to distinguish adjacent labels. */
  readonly decimals: number;
}

/** How many minor divisions each 1-2-5 step is split into. */
const MINOR_DIVISIONS: Record<number, number> = { 1: 5, 2: 4, 5: 5 };

/** Guards against generating unbounded arrays for degenerate inputs. */
const MAX_TICKS = 2000;

/** Rounds a raw spacing up to the nearest 1, 2 or 5 times a power of ten. */
export function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = Math.pow(10, exponent);
  const normalised = rawStep / magnitude;
  const mantissa = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return mantissa * magnitude;
}

/**
 * Chooses tick spacing for an axis.
 *
 * @param pixelsPerUnit scale of the axis
 * @param targetSpacing preferred distance between labelled ticks, in pixels
 */
export function tickScale(pixelsPerUnit: number, targetSpacing = 90): TickScale {
  const step = niceStep(targetSpacing / Math.max(pixelsPerUnit, Number.MIN_VALUE));
  const mantissa = Math.round(step / Math.pow(10, Math.floor(Math.log10(step))));
  const divisions = MINOR_DIVISIONS[mantissa] ?? 5;
  return { step, minorStep: step / divisions };
}

/** Multiples of `step` covering [min, max], inclusive of the ends. */
export function ticksInRange(min: number, max: number, step: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(step > 0)) return [];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const first = Math.ceil(lo / step - 1e-9);
  const last = Math.floor(hi / step + 1e-9);
  const count = last - first + 1;
  if (count <= 0 || count > MAX_TICKS) return [];

  const values: number[] = [];
  for (let i = first; i <= last; i += 1) {
    // Multiplying the integer index avoids the drift of repeated addition.
    values.push(roundToStep(i * step, step));
  }
  return values;
}

/** Removes floating-point dust such as 0.30000000000000004. */
function roundToStep(value: number, step: number): number {
  const decimals = decimalsForStep(step);
  const factor = Math.pow(10, Math.min(decimals + 2, 15));
  const rounded = Math.round(value * factor) / factor;
  // Normalise -0, which would otherwise print as "-0" and break equality.
  return rounded === 0 ? 0 : rounded;
}

export function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  return Math.max(0, Math.min(15, -Math.floor(Math.log10(step) + 1e-9)));
}

export function axisTicks(min: number, max: number, pixelsPerUnit: number, targetSpacing = 90): AxisTicks {
  const { step, minorStep } = tickScale(pixelsPerUnit, targetSpacing);
  const major = ticksInRange(min, max, step);
  const majorSet = new Set(major);
  const minor = ticksInRange(min, max, minorStep).filter((value) => !majorSet.has(value));
  return { step, minorStep, major, minor, decimals: decimalsForStep(step) };
}

/**
 * Formats a tick label, switching to exponent notation only when a decimal
 * string would be unreadably long.
 */
export function formatTick(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return '';
  if (value === 0) return '0';

  const magnitude = Math.abs(value);
  if (magnitude >= 1e6 || magnitude < 1e-5) {
    return trimExponent(value.toExponential(2));
  }
  return value.toFixed(decimals);
}

function trimExponent(text: string): string {
  return text.replace(/\.?0+e/, 'e').replace('e+', 'e');
}
