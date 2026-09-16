import { ExpressionError } from '../expression/errors';

/**
 * Numerical methods, over plain functions of one number.
 *
 * Nothing here knows about expressions, names or the workspace: each takes a
 * closure and returns a number, so it can be checked against a result known in
 * closed form and reused by anything able to produce a closure.
 *
 * Each one says what it cannot do rather than returning a plausible number for
 * it. An integrand that is undefined inside the interval, a root that is not
 * bracketed by a change of sign, and limits that are not finite are all
 * refused by name.
 */

/** What every method here takes: a function of one number. */
export type UnaryFunction = (x: number) => number;

/** Where Simpson's rule stops refining, relative to the size of the result. */
const INTEGRAL_TOLERANCE = 1e-10;
const INTEGRAL_DEPTH = 40;

const ROOT_TOLERANCE = 1e-14;
const ROOT_ITERATIONS = 200;

/** How finely an interval is scanned before an extremum is refined in it. */
const SEARCH_SAMPLES = 200;
const SEARCH_ITERATIONS = 200;
/**
 * A smooth extremum is quadratically flat, so moving the square root of
 * machine precision away from it changes the value by less than machine
 * precision. Asking for a closer x than that only burns iterations comparing
 * numbers that are equal; the value itself is accurate to the last bit.
 */
const SEARCH_TOLERANCE = Math.sqrt(Number.EPSILON);

/** 1/φ, the ratio that lets golden-section reuse one sample per step. */
const INVERSE_GOLDEN = (Math.sqrt(5) - 1) / 2;

/**
 * The definite integral of `f` from `a` to `b`, by adaptive Simpson's rule.
 *
 * Adaptive rather than uniform for the same reason the plotter samples
 * adaptively: a uniform rule spreads its effort evenly over an interval where
 * the function is mostly flat and one bend carries all of the error. Each
 * panel is halved until Simpson's estimate for the halves agrees with the
 * estimate for the whole, so the work goes where the curvature is.
 */
export function integrate(f: UnaryFunction, a: number, b: number): number {
  requireFinite(a, b, 'An integral');
  if (a === b) return 0;
  // Which way round the limits are is the reader's business, not the rule's.
  if (b < a) return -integrate(f, b, a);

  const sample = (x: number): number => {
    const y = f(x);
    if (!Number.isFinite(y)) {
      throw new ExpressionError(
        `This function is not defined everywhere between ${format(a)} and ${format(b)}`,
      );
    }
    return y;
  };

  const panel = (
    left: number,
    right: number,
    fLeft: number,
    fMid: number,
    fRight: number,
  ): number => ((right - left) / 6) * (fLeft + 4 * fMid + fRight);

  const refine = (
    left: number,
    right: number,
    fLeft: number,
    fMid: number,
    fRight: number,
    whole: number,
    tolerance: number,
    depth: number,
  ): number => {
    const mid = (left + right) / 2;
    const fLeftMid = sample((left + mid) / 2);
    const fRightMid = sample((mid + right) / 2);

    const leftHalf = panel(left, mid, fLeft, fLeftMid, fMid);
    const rightHalf = panel(mid, right, fMid, fRightMid, fRight);
    const difference = leftHalf + rightHalf - whole;

    // The halves are sixteen times as accurate, so their disagreement with the
    // whole both measures the error left and, divided by fifteen, removes it.
    if (depth <= 0 || Math.abs(difference) <= 15 * tolerance) {
      return leftHalf + rightHalf + difference / 15;
    }
    return (
      refine(left, mid, fLeft, fLeftMid, fMid, leftHalf, tolerance / 2, depth - 1) +
      refine(mid, right, fMid, fRightMid, fRight, rightHalf, tolerance / 2, depth - 1)
    );
  };

  const fa = sample(a);
  const fMid = sample((a + b) / 2);
  const fb = sample(b);
  const whole = panel(a, b, fa, fMid, fb);
  const tolerance = INTEGRAL_TOLERANCE * Math.max(1, Math.abs(whole));
  const result = refine(a, b, fa, fMid, fb, whole, tolerance, INTEGRAL_DEPTH);

  if (!Number.isFinite(result)) {
    throw new ExpressionError(
      `This integral does not converge between ${format(a)} and ${format(b)}`,
    );
  }
  return result;
}

/**
 * The root of `f` between `a` and `b`, by Brent's method.
 *
 * Brent keeps bisection's guarantee — the root stays bracketed, so it always
 * converges — while taking an inverse quadratic or secant step wherever that
 * is better behaved, which is nearly everywhere. The bracket is required
 * rather than searched for: without a change of sign there may be no root, or
 * several, and returning one of them anyway would be a guess dressed up as an
 * answer.
 *
 * The interpolation is written in terms of ratios of the residuals rather than
 * of the residuals themselves. That is not a stylistic choice: approaching the
 * root of something as flat as `x^15`, the residuals reach 1e-150 and their
 * products underflow, so the direct form divides one denormal number by
 * another and returns NaN, while the ratios stay near one throughout.
 */
export function findRoot(f: UnaryFunction, a: number, b: number): number {
  requireFinite(a, b, 'A search for a root');

  const fa = f(a);
  const fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) {
    throw new ExpressionError(
      `This function is not defined at ${format(a)} or at ${format(b)}`,
    );
  }
  if (Math.sign(fa) === Math.sign(fb)) {
    throw new ExpressionError(
      `This function has the same sign at ${format(a)} and at ${format(b)}, so no root between them is bracketed`,
    );
  }

  // `best` is the current answer, `contra` the far end of the bracket, and
  // `previous` where `best` was last time.
  let previous = a;
  let fPrevious = fa;
  let best = b;
  let fBest = fb;
  let contra = b;
  let fContra = fb;
  let step = 0;
  let previousStep = 0;

  for (let i = 0; i < ROOT_ITERATIONS; i += 1) {
    if ((fBest > 0 && fContra > 0) || (fBest < 0 && fContra < 0)) {
      // The bracket has collapsed to one side; re-open it with `previous`.
      contra = previous;
      fContra = fPrevious;
      step = best - previous;
      previousStep = step;
    }
    if (Math.abs(fContra) < Math.abs(fBest)) {
      previous = best;
      fPrevious = fBest;
      best = contra;
      fBest = fContra;
      contra = previous;
      fContra = fPrevious;
    }

    const tolerance = 2 * Number.EPSILON * Math.abs(best) + ROOT_TOLERANCE / 2;
    const half = (contra - best) / 2;
    if (Math.abs(half) <= tolerance || fBest === 0) return best;

    if (Math.abs(previousStep) >= tolerance && Math.abs(fPrevious) > Math.abs(fBest)) {
      const toPrevious = fBest / fPrevious;
      let numerator: number;
      let denominator: number;
      if (previous === contra) {
        // Only two distinct points: a secant step.
        numerator = 2 * half * toPrevious;
        denominator = 1 - toPrevious;
      } else {
        const previousToContra = fPrevious / fContra;
        const bestToContra = fBest / fContra;
        numerator =
          toPrevious *
          (2 * half * previousToContra * (previousToContra - bestToContra) -
            (best - previous) * (bestToContra - 1));
        denominator =
          (previousToContra - 1) * (bestToContra - 1) * (toPrevious - 1);
      }
      if (numerator > 0) denominator = -denominator;
      numerator = Math.abs(numerator);

      // Take the step only where it stays inside the bracket and is at least
      // halving what the last step left; otherwise bisect, which always does.
      const withinBracket = 3 * half * denominator - Math.abs(tolerance * denominator);
      const fasterThanLast = Math.abs(previousStep * denominator);
      if (2 * numerator < Math.min(withinBracket, fasterThanLast)) {
        previousStep = step;
        step = numerator / denominator;
      } else {
        step = half;
        previousStep = step;
      }
    } else {
      step = half;
      previousStep = step;
    }

    previous = best;
    fPrevious = fBest;
    best += Math.abs(step) > tolerance ? step : Math.sign(half) * tolerance;
    fBest = f(best);
  }

  throw new ExpressionError(
    `No root of this function converged between ${format(a)} and ${format(b)}`,
  );
}

/** Where a function is least or greatest on an interval, and what it is there. */
export interface Extremum {
  readonly x: number;
  readonly value: number;
}

/**
 * The least or greatest value of `f` between `a` and `b`.
 *
 * Golden-section search converges on a minimum but only ever finds the one it
 * starts next to, so the interval is scanned first and the search is given the
 * lowest sample's neighbours to work between. That finds the deepest dip of
 * anything resembling a drawable function, and finds the endpoint when the
 * extremum is there — but a dip narrower than the scan can still hide, which
 * is the honest limit of looking for something without solving for it.
 */
export function findExtremum(
  f: UnaryFunction,
  a: number,
  b: number,
  sense: 'minimum' | 'maximum',
): Extremum {
  requireFinite(a, b, `A search for a ${sense}`);
  const lowest = sense === 'minimum' ? f : (x: number) => -f(x);

  const lower = Math.min(a, b);
  const upper = Math.max(a, b);
  if (lower === upper) return { x: lower, value: valueAt(f, lower) };

  // Scan for the best sample, and keep its neighbours as the bracket.
  const step = (upper - lower) / SEARCH_SAMPLES;
  let bestIndex = -1;
  let best = Infinity;
  for (let i = 0; i <= SEARCH_SAMPLES; i += 1) {
    const y = lowest(lower + i * step);
    if (!Number.isFinite(y) || y >= best) continue;
    best = y;
    bestIndex = i;
  }
  if (bestIndex < 0) {
    throw new ExpressionError(
      `This function is not defined anywhere between ${format(a)} and ${format(b)}`,
    );
  }

  let left = lower + Math.max(0, bestIndex - 1) * step;
  let right = lower + Math.min(SEARCH_SAMPLES, bestIndex + 1) * step;

  let inner = right - INVERSE_GOLDEN * (right - left);
  let outer = left + INVERSE_GOLDEN * (right - left);
  let fInner = lowest(inner);
  let fOuter = lowest(outer);

  for (let i = 0; i < SEARCH_ITERATIONS; i += 1) {
    if (right - left <= SEARCH_TOLERANCE * (1 + Math.abs(left) + Math.abs(right))) break;
    if (fInner < fOuter) {
      right = outer;
      outer = inner;
      fOuter = fInner;
      inner = right - INVERSE_GOLDEN * (right - left);
      fInner = lowest(inner);
    } else {
      left = inner;
      inner = outer;
      fInner = fOuter;
      outer = left + INVERSE_GOLDEN * (right - left);
      fOuter = lowest(outer);
    }
  }

  const x = (left + right) / 2;
  return { x, value: valueAt(f, x) };
}

function valueAt(f: UnaryFunction, x: number): number {
  const y = f(x);
  if (!Number.isFinite(y)) {
    throw new ExpressionError(`This function is not defined at ${format(x)}`);
  }
  return y;
}

function requireFinite(a: number, b: number, what: string): void {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new ExpressionError(`${what} needs finite limits`);
  }
}

/** Limits appear in messages, so they are rounded to something readable. */
function format(value: number): string {
  return String(Number(value.toPrecision(6)));
}
