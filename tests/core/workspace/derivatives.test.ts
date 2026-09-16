import { describe, expect, it } from 'vitest';
import { evaluateWorkspace, type WorkspaceState } from '@/core/workspace/evaluate';
import { toSource } from '@/core/expression/print';
import type { ItemResult, WorkspaceItem } from '@/core/workspace/types';

function workspace(...sources: [string, string][]): WorkspaceItem[] {
  return sources.map(([id, source]) => ({ id, source }));
}

function get(state: WorkspaceState, id: string): ItemResult {
  const result = state.results.get(id);
  if (result === undefined) throw new Error(`no result for ${id}`);
  return result;
}

function valueOf(state: WorkspaceState, id: string): number {
  const result = get(state, id);
  if (result.kind !== 'value' || result.value.kind !== 'number') {
    throw new Error(`${id} is not a number: ${JSON.stringify(result)}`);
  }
  return result.value.value;
}

function curveOf(state: WorkspaceState, id: string) {
  const result = get(state, id);
  const curve = result.kind === 'curve' ? result.curve : null;
  if (curve === null) throw new Error(`${id} has no curve: ${JSON.stringify(result)}`);
  return curve;
}

function messageOf(state: WorkspaceState, id: string): string {
  const result = get(state, id);
  if (result.kind !== 'error') throw new Error(`${id} is ${result.kind}, not an error`);
  return result.message;
}

/** The derivative bodies a function entry ended up carrying. */
function bodiesOf(state: WorkspaceState, id: string): string[] {
  const result = get(state, id);
  if (result.kind !== 'function') throw new Error(`${id} is ${result.kind}`);
  return result.derivatives.map((derivative) => `${derivative.name} = ${toSource(derivative.body)}`);
}

describe('prime notation in a workspace', () => {
  it('evaluates a derivative at a point', () => {
    const state = evaluateWorkspace(
      workspace(['f', 'f(x) = x^3'], ['at', "p = f'(2)"]),
    );
    expect(valueOf(state, 'at')).toBe(12);
  });

  it('plots a derivative as a curve of its own', () => {
    const state = evaluateWorkspace(
      workspace(['f', 'f(x) = sin(x)'], ['d', "f'(x)"]),
    );
    const curve = curveOf(state, 'd');
    expect(curve.variable).toBe('x');
    expect(curve.evaluate(0)).toBeCloseTo(1, 12);
    expect(curve.evaluate(Math.PI / 2)).toBeCloseTo(0, 12);
  });

  it('reads the conventional y = form too', () => {
    const state = evaluateWorkspace(
      workspace(['f', 'f(x) = x^2'], ['d', "y = f'(x)"]),
    );
    expect(curveOf(state, 'd').evaluate(3)).toBe(6);
  });

  it('stacks primes for higher derivatives', () => {
    const state = evaluateWorkspace(
      workspace(['f', 'f(x) = sin(x)'], ['d3', "p = f'''(0)"]),
    );
    // The third derivative of sin is -cos, which is -1 at zero.
    expect(valueOf(state, 'd3')).toBe(-1);
    expect(bodiesOf(state, 'f')).toEqual([
      "f' = cos(x)",
      "f'' = -sin(x)",
      "f''' = -cos(x)",
    ]);
  });

  it('keeps the function’s own parameter name', () => {
    const state = evaluateWorkspace(
      workspace(['f', 'f(t) = t^2'], ['d', "p = f'(4)"]),
    );
    expect(bodiesOf(state, 'f')).toEqual(["f' = 2t"]);
    expect(valueOf(state, 'd')).toBe(8);
  });

  it('differentiates a built-in function', () => {
    const state = evaluateWorkspace(workspace(['d', "p = sin'(0)"], ['e', "q = exp''(0)"]));
    expect(valueOf(state, 'd')).toBe(1);
    expect(valueOf(state, 'e')).toBe(1);
  });

  it('differentiates through another definition', () => {
    const state = evaluateWorkspace(
      workspace(['f', 'f(x) = x^2'], ['g', 'g(x) = f(x)^2'], ['d', "p = g'(3)"]),
    );
    // g is x^4, so g' is 4x^3.
    expect(valueOf(state, 'd')).toBe(108);
  });

  it('treats a parameter as constant, and follows it when it changes', () => {
    const items = workspace(['a', 'a = 2'], ['f', 'f(x) = a x^2'], ['d', "p = f'(3)"]);
    const first = evaluateWorkspace(items);
    expect(bodiesOf(first, 'f')).toEqual(["f' = 2a x"]);
    expect(valueOf(first, 'd')).toBe(12);

    const next = evaluateWorkspace(
      workspace(['a', 'a = 5'], ['f', 'f(x) = a x^2'], ['d', "p = f'(3)"]),
      first,
    );
    expect(valueOf(next, 'd')).toBe(30);
  });

  it('produces only the derivatives something asks for', () => {
    const none = evaluateWorkspace(workspace(['f', 'f(x) = x^2']));
    expect(bodiesOf(none, 'f')).toEqual([]);

    const asked = evaluateWorkspace(workspace(['f', 'f(x) = x^2'], ['d', "f''(x)"]));
    expect(bodiesOf(asked, 'f')).toEqual(["f' = 2x", "f'' = 2"]);
  });

  it('recomputes the definition when a new prime is written', () => {
    const first = evaluateWorkspace(workspace(['f', 'f(x) = x^4'], ['d', "f'(x)"]));
    const second = evaluateWorkspace(
      workspace(['f', 'f(x) = x^4'], ['d', "f''(x)"]),
      first,
    );
    expect(second.recomputed.has('f')).toBe(true);
    expect(curveOf(second, 'd').evaluate(2)).toBe(48);
  });

  it('leaves an unrelated definition alone when a prime is written elsewhere', () => {
    const first = evaluateWorkspace(workspace(['f', 'f(x) = x^4'], ['g', 'g(x) = x^2']));
    const second = evaluateWorkspace(
      workspace(['f', 'f(x) = x^4'], ['g', 'g(x) = x^2'], ['d', "f'(x)"]),
      first,
    );
    // f has to be recomputed to carry its derivative; g has no reason to be.
    expect(second.recomputed.has('f')).toBe(true);
    expect(second.recomputed.has('g')).toBe(false);
  });

  it('needs nothing else to draw a tangent line', () => {
    const state = evaluateWorkspace(
      workspace(
        ['a', 'a = 1.5'],
        ['f', 'f(x) = x^2'],
        ['t', "y = f(a) + f'(a)(x - a)"],
      ),
    );
    // The tangent to x^2 at 1.5 is y = 3x - 2.25: it touches there and has the
    // slope of the curve.
    const tangent = curveOf(state, 't');
    expect(tangent.evaluate(1.5)).toBeCloseTo(2.25, 12);
    expect(tangent.evaluate(2.5)).toBeCloseTo(5.25, 12);
    expect(tangent.evaluate(0)).toBeCloseTo(-2.25, 12);
  });

  it('reads the derivative of a derivative as one more prime', () => {
    const state = evaluateWorkspace(
      workspace(['f', 'f(x) = x^5'], ['g', "g(x) = f'(x)"], ['d', "p = g'(2)"]),
    );
    // f' is 5x^4, so g' is 20x^3.
    expect(valueOf(state, 'd')).toBe(160);
  });
});

describe('prime notation that cannot mean anything', () => {
  it('refuses to let a primed name be defined', () => {
    const state = evaluateWorkspace(workspace(['f', "f'(x) = 2x"]));
    expect(messageOf(state, 'f')).toContain('cannot be defined');
  });

  it('reports the function without a derivative, on the entry that asked', () => {
    const state = evaluateWorkspace(
      workspace(['f', 'f(x) = floor(x)'], ['d', "p = f'(1)"]),
    );
    // The definition is fine; asking it for a slope is not.
    expect(get(state, 'f').kind).toBe('function');
    expect(messageOf(state, 'd')).toBe("f' is not available: floor has no derivative");
  });

  it('reports a value that is not a function', () => {
    const state = evaluateWorkspace(workspace(['a', 'a = 2'], ['d', "p = a'(1)"]));
    expect(messageOf(state, 'd')).toContain('is a value, not a function');
  });

  it('reports a function of more than one variable', () => {
    const state = evaluateWorkspace(
      workspace(['f', 'f(x, y) = x y'], ['d', "p = f'(1)"]),
    );
    expect(messageOf(state, 'd')).toContain('functions of one variable');
  });

  it('reports a built-in that does not take exactly one argument', () => {
    // `log` has a derivative, but an optional base means a prime on it would
    // not say which function is meant.
    const state = evaluateWorkspace(workspace(['d', "p = log'(2)"], ['e', "q = min'(2)"]));
    expect(messageOf(state, 'd')).toContain('functions of one variable');
    expect(messageOf(state, 'e')).toContain('functions of one variable');
  });

  it('reports a built-in with no derivative on the entry that asked', () => {
    const state = evaluateWorkspace(workspace(['d', "p = floor'(2)"]));
    expect(messageOf(state, 'd')).toBe("floor' is not available: floor has no derivative");
  });

  it('reports a name that is a function over values, not over numbers', () => {
    const state = evaluateWorkspace(workspace(['d', "p = midpoint'(2)"]));
    expect(messageOf(state, 'd')).toContain('is not a function of one number');
  });

  it('reports an undefined name by its base', () => {
    const state = evaluateWorkspace(workspace(['d', "p = nope'(1)"]));
    expect(messageOf(state, 'd')).toBe('Unknown name "nope"; define it to use it here');
  });

  it('stops before an unreasonable number of primes', () => {
    const state = evaluateWorkspace(
      workspace(['f', 'f(x) = x^9'], ['d', "p = f'''''''(1)"]),
    );
    expect(messageOf(state, 'd')).toContain('at most 6');
  });

  it('recovers as soon as the definition can be differentiated', () => {
    const broken = evaluateWorkspace(
      workspace(['f', 'f(x) = floor(x)'], ['d', "p = f'(2)"]),
    );
    expect(get(broken, 'd').kind).toBe('error');
    const fixed = evaluateWorkspace(
      workspace(['f', 'f(x) = x^2'], ['d', "p = f'(2)"]),
      broken,
    );
    expect(valueOf(fixed, 'd')).toBe(4);
  });
});
