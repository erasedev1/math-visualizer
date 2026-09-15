/**
 * Adaptive sampling of y = f(x) into screen-ready polylines.
 *
 * Three things make the difference between a plot that looks right and one
 * that does not:
 *
 *  - Flatness refinement: a uniform grid misses the peaks of `sin(50x)` and
 *    wastes samples on straight lines. Intervals are subdivided only while the
 *    curve deviates from its chord by more than a fraction of a pixel.
 *  - Gaps: `sqrt(x)` and `ln(x)` are undefined on part of the domain, so the
 *    polyline must be broken rather than closed across the hole.
 *  - Poles: `1/x` and `tan(x)` jump from -infinity to +infinity between two
 *    adjacent samples. Joining those samples would draw a line that does not
 *    exist, so the curve is split there too.
 */

export interface SampleOptions {
  readonly xMin: number;
  readonly xMax: number;
  /** Visible y range, used to detect poles and to bound emitted coordinates. */
  readonly yMin: number;
  readonly yMax: number;
  readonly pixelsPerUnitX: number;
  readonly pixelsPerUnitY: number;
  /** Initial samples per horizontal pixel. Defaults to 1. */
  readonly samplesPerPixel?: number;
  /** Maximum recursive subdivisions per interval. Defaults to 6. */
  readonly maxDepth?: number;
  /** Chord deviation, in pixels, that triggers subdivision. Defaults to 0.3. */
  readonly tolerance?: number;
}

/** A connected run of points, flattened as [x0, y0, x1, y1, ...]. */
export type Polyline = Float64Array;

export interface SampledCurve {
  readonly segments: readonly Polyline[];
  /** Number of times `fn` was called, for performance tests and diagnostics. */
  readonly evaluations: number;
}

const MIN_BASE_SAMPLES = 2;
const MAX_BASE_SAMPLES = 20000;

/**
 * How far beyond the visible range a coordinate may go before being clamped.
 * Keeping values near the viewport avoids feeding huge numbers to the canvas
 * while still drawing a near-vertical line towards an asymptote.
 */
const OVERSHOOT_FACTOR = 4;

export function sampleFunction(fn: (x: number) => number, options: SampleOptions): SampledCurve {
  const { xMin, xMax } = options;
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) {
    return { segments: [], evaluations: 0 };
  }

  const samplesPerPixel = options.samplesPerPixel ?? 1;
  const maxDepth = options.maxDepth ?? 6;
  const tolerance = options.tolerance ?? 0.3;
  const pixelsPerUnitX = Math.max(options.pixelsPerUnitX, Number.MIN_VALUE);
  const pixelsPerUnitY = Math.max(options.pixelsPerUnitY, Number.MIN_VALUE);

  const visibleHeight = Math.abs(options.yMax - options.yMin);
  const overshoot = visibleHeight * OVERSHOOT_FACTOR;
  const clampMin = options.yMin - overshoot;
  const clampMax = options.yMax + overshoot;

  const widthPixels = (xMax - xMin) * pixelsPerUnitX;
  const baseSamples = Math.min(
    MAX_BASE_SAMPLES,
    Math.max(MIN_BASE_SAMPLES, Math.ceil(widthPixels * samplesPerPixel)),
  );
  const dx = (xMax - xMin) / baseSamples;

  const state: SamplerState = {
    fn,
    evaluations: 0,
    maxDepth,
    tolerance,
    pixelsPerUnitX,
    pixelsPerUnitY,
    clampMin,
    clampMax,
    yMin: options.yMin,
    yMax: options.yMax,
    segments: [],
    current: [],
  };

  let previousX = xMin;
  let previousY = evaluateAt(state, xMin);

  appendPoint(state, previousX, previousY);

  for (let i = 1; i <= baseSamples; i += 1) {
    const x = i === baseSamples ? xMax : xMin + i * dx;
    const y = evaluateAt(state, x);
    refine(state, previousX, previousY, x, y, 0);
    appendPoint(state, x, y);
    previousX = x;
    previousY = y;
  }

  flush(state);
  return { segments: state.segments, evaluations: state.evaluations };
}

interface SamplerState {
  readonly fn: (x: number) => number;
  evaluations: number;
  readonly maxDepth: number;
  readonly tolerance: number;
  readonly pixelsPerUnitX: number;
  readonly pixelsPerUnitY: number;
  readonly clampMin: number;
  readonly clampMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly segments: Polyline[];
  current: number[];
}

function evaluateAt(state: SamplerState, x: number): number {
  state.evaluations += 1;
  const y = state.fn(x);
  return typeof y === 'number' ? y : NaN;
}

/**
 * Adds intermediate points between two samples while the curve is not flat in
 * screen space. Both endpoints are already emitted by the caller.
 */
function refine(
  state: SamplerState,
  xA: number,
  yA: number,
  xB: number,
  yB: number,
  depth: number,
): void {
  if (depth >= state.maxDepth) return;

  const xM = (xA + xB) / 2;
  const yM = evaluateAt(state, xM);

  const endpointsDefined = Number.isFinite(yA) && Number.isFinite(yB);
  const midDefined = Number.isFinite(yM);

  // A definedness change inside the interval means the true edge of the domain
  // (or a pole) lies here; narrow it down so the gap lands in the right place.
  if (endpointsDefined !== midDefined || !midDefined) {
    refine(state, xA, yA, xM, yM, depth + 1);
    appendPoint(state, xM, yM);
    refine(state, xM, yM, xB, yB, depth + 1);
    return;
  }

  if (endpointsDefined && isFlat(state, xA, yA, xM, yM, xB, yB)) return;

  refine(state, xA, yA, xM, yM, depth + 1);
  appendPoint(state, xM, yM);
  refine(state, xM, yM, xB, yB, depth + 1);
}

/** Deviation of the midpoint from the chord, measured in pixels. */
function isFlat(
  state: SamplerState,
  xA: number,
  yA: number,
  xM: number,
  yM: number,
  xB: number,
  yB: number,
): boolean {
  const chordY = yA + ((yB - yA) * (xM - xA)) / (xB - xA);
  const deviationPixels = Math.abs(yM - chordY) * state.pixelsPerUnitY;
  if (deviationPixels <= state.tolerance) return true;
  // Once an interval is narrower than a pixel there is nothing left to gain.
  return (xB - xA) * state.pixelsPerUnitX <= 1;
}

function appendPoint(state: SamplerState, x: number, y: number): void {
  if (!Number.isFinite(y)) {
    flush(state);
    return;
  }

  const points = state.current;
  const count = points.length;
  if (count >= 2) {
    const previousY = points[count - 1]!;
    if (crossesPole(state, previousY, y)) {
      flush(state);
      state.current.push(x, clamp(state, y));
      return;
    }
  }

  points.push(x, clamp(state, y));
}

/**
 * True when two adjacent samples sit beyond opposite edges of the visible
 * range, which is the signature of a vertical asymptote between them.
 */
function crossesPole(state: SamplerState, previousY: number, y: number): boolean {
  return (
    (previousY > state.yMax && y < state.yMin) || (previousY < state.yMin && y > state.yMax)
  );
}

function clamp(state: SamplerState, y: number): number {
  if (y > state.clampMax) return state.clampMax;
  if (y < state.clampMin) return state.clampMin;
  return y;
}

/** Ends the run in progress, discarding runs too short to draw. */
function flush(state: SamplerState): void {
  if (state.current.length >= 4) {
    state.segments.push(Float64Array.from(state.current));
  }
  state.current = [];
}
