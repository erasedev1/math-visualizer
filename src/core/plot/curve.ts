import type { Expr } from '../expression/ast';
import { compile, type CompileOptions } from '../expression/compile';
import { toSource } from '../expression/print';

/** A function of one variable, ready for the sampler to draw. */
export interface PlottableCurve {
  /** Name of the variable swept along the horizontal axis. */
  readonly variable: string;
  /** How the curve is described in the UI, e.g. `f(x)` or `y`. */
  readonly label: string;
  /** Normalised source, for echoing input back to the user. */
  readonly normalised: string;
  readonly evaluate: (x: number) => number;
}

export type CurveScope = Omit<CompileOptions, 'params'>;

/**
 * Compiles an expression into a curve.
 *
 * The compiled closure reuses a single argument array across every sample, so
 * plotting a frame allocates nothing per point.
 */
export function compileCurve(
  body: Expr,
  variable: string,
  label: string,
  scope: CurveScope = {},
): PlottableCurve {
  const compiled = compile(body, { ...scope, params: [variable] });
  const args: number[] = [0];
  return {
    variable,
    label,
    normalised: toSource(body),
    evaluate: (x: number) => {
      args[0] = x;
      return compiled(args);
    },
  };
}
