import type { PlottableCurve } from '../plot/curve';
import type { Value } from '../values/types';
import { isGeometry } from '../values/types';

/**
 * The part of a workspace entry the engine cares about.
 *
 * Presentation (colour, line width, slider bounds) lives in the UI layer, so
 * the evaluator can be driven from a test, a file or an AI tool call without
 * inventing styling.
 */
export interface WorkspaceItem {
  readonly id: string;
  readonly source: string;
}

interface ResultBase {
  readonly id: string;
  /** Ids of the items this one reads. */
  readonly dependencies: readonly string[];
}

/** A blank line. */
export interface EmptyResult extends ResultBase {
  readonly kind: 'empty';
}

/**
 * A value: a number such as `a = 2`, a point such as `A = (1, 2)`, or a shape
 * such as `c = circle(A, 3)`. Unnamed when the entry is a bare expression.
 */
export interface ValueResult extends ResultBase {
  readonly kind: 'value';
  readonly name: string | null;
  readonly value: Value;
  /**
   * What is written in the source, when the body is nothing but a literal.
   * Only then can a slider or a drag write a new value back into the text.
   */
  readonly literal: LiteralForm | null;
}

/** A definition whose body is a bare literal, and so can be edited directly. */
export type LiteralForm =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'point'; readonly x: number; readonly y: number }
  | { readonly kind: 'vector'; readonly components: readonly number[] }
  | { readonly kind: 'matrix'; readonly rows: readonly (readonly number[])[] };

/** A named function, such as `f(x) = a x^2`. */
export interface FunctionResult extends ResultBase {
  readonly kind: 'function';
  readonly name: string;
  readonly params: readonly string[];
  readonly call: (args: readonly number[]) => number;
  /** Functions of one variable can be drawn; others are still callable. */
  readonly curve: PlottableCurve | null;
}

/** An unnamed graph, such as `x^2` or `y = sin(x)`. */
export interface CurveResult extends ResultBase {
  readonly kind: 'curve';
  readonly curve: PlottableCurve;
}

export interface ErrorResult extends ResultBase {
  readonly kind: 'error';
  readonly message: string;
  /** Source range to highlight, when the failure has a known position. */
  readonly start?: number;
  readonly end?: number;
}

export type ItemResult =
  | EmptyResult
  | ValueResult
  | FunctionResult
  | CurveResult
  | ErrorResult;

/** The curve an item contributes to the graph, if any. */
export function resultCurve(result: ItemResult): PlottableCurve | null {
  if (result.kind === 'curve') return result.curve;
  if (result.kind === 'function') return result.curve;
  return null;
}

/** The value an item contributes to the scope, if any. */
export function resultValue(result: ItemResult): Value | null {
  return result.kind === 'value' ? result.value : null;
}

/** The geometric shape an item draws, if any. */
export function resultShape(result: ItemResult): Value | null {
  if (result.kind !== 'value') return null;
  return isGeometry(result.value) ? result.value : null;
}
