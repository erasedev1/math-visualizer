import { compile } from '../expression/compile';
import { parseDefinition } from '../expression/definition';
import { describeError, isExpressionError } from '../expression/errors';
import { freeVariables } from '../expression/ast';
import { toSource } from '../expression/print';
import type { Expr } from '../expression/ast';
import { BUILTIN_CONSTANTS } from '../expression/functions';

/**
 * Turns a line of user input into something the graph can draw, or into an
 * explanation of why it cannot.
 *
 * This is the single place that decides what an entry *means*, so the UI never
 * has to interpret expressions and the renderer never has to know about text.
 * Failures are returned rather than thrown: an unfinished expression is a
 * normal state while typing, not an exception.
 */

/** The variable a bare expression is graphed against. */
export const DEFAULT_PLOT_VARIABLE = 'x';

/** `y = ...` is the conventional way to write a graph, so it is honoured. */
export const IMPLICIT_PLOT_TARGET = 'y';

export interface PlottableCurve {
  readonly kind: 'curve';
  /** Name of the variable swept along the horizontal axis. */
  readonly variable: string;
  /** How the entry is described in the UI, e.g. `f(x)` or `y`. */
  readonly label: string;
  readonly evaluate: (x: number) => number;
  /** Normalised source, useful for echoing input back to the user. */
  readonly normalised: string;
}

export interface AnalysisEmpty {
  readonly kind: 'empty';
}

/** Parsed and understood, but outside what this milestone can graph. */
export interface AnalysisUnsupported {
  readonly kind: 'unsupported';
  readonly message: string;
}

export interface AnalysisError {
  readonly kind: 'error';
  readonly message: string;
  /** Source range to highlight, when the failure has a known position. */
  readonly start?: number;
  readonly end?: number;
}

export type Analysis = PlottableCurve | AnalysisEmpty | AnalysisUnsupported | AnalysisError;

export function analyzeEntry(source: string): Analysis {
  if (source.trim() === '') return { kind: 'empty' };

  try {
    const definition = parseDefinition(source);

    switch (definition.kind) {
      case 'function': {
        const [parameter, ...rest] = definition.params;
        if (parameter === undefined) {
          return { kind: 'error', message: 'This function has no parameters' };
        }
        if (rest.length > 0) {
          return {
            kind: 'unsupported',
            message: `Functions of ${definition.params.length} variables need the 3D engine, which is not built yet`,
          };
        }
        return curve(
          definition.body,
          parameter,
          `${definition.name}(${parameter})`,
        );
      }

      case 'variable': {
        if (definition.name !== IMPLICIT_PLOT_TARGET) {
          return {
            kind: 'unsupported',
            message: `Named values such as "${definition.name}" become graph objects and sliders in the next milestone; write "y = ..." or a bare expression to plot a curve`,
          };
        }
        return plotAgainstFreeVariable(definition.body, IMPLICIT_PLOT_TARGET);
      }

      case 'expression':
        return plotAgainstFreeVariable(definition.body, toSource(definition.body));
    }
  } catch (error) {
    if (isExpressionError(error)) {
      const analysis: AnalysisError = { kind: 'error', message: error.message };
      return error.end > error.start
        ? { ...analysis, start: error.start, end: error.end }
        : analysis;
    }
    return { kind: 'error', message: describeError(error) };
  }
}

/**
 * Graphs an expression against its own single free variable, so `t^2` plots
 * as readily as `x^2`, and a constant plots as a horizontal line.
 */
function plotAgainstFreeVariable(body: Expr, label: string): Analysis {
  const free = freeVariables(body, Object.keys(BUILTIN_CONSTANTS));

  if (free.length === 0) return curve(body, DEFAULT_PLOT_VARIABLE, label);
  if (free.length === 1) return curve(body, free[0]!, label);

  return {
    kind: 'unsupported',
    message: `This uses several variables (${free.join(', ')}); only one of them can be the horizontal axis until sliders arrive`,
  };
}

function curve(body: Expr, variable: string, label: string): Analysis {
  try {
    const compiled = compile(body, { params: [variable] });
    // One scratch array, reused for every sample, keeps plotting allocation-free.
    const args: number[] = [0];
    return {
      kind: 'curve',
      variable,
      label,
      normalised: toSource(body),
      evaluate: (x: number) => {
        args[0] = x;
        return compiled(args);
      },
    };
  } catch (error) {
    return { kind: 'error', message: describeError(error) };
  }
}
