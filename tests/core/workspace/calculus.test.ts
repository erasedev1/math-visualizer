import { describe, expect, it } from 'vitest';
import { evaluateWorkspace, type WorkspaceState } from '@/core/workspace/evaluate';
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

/** Evaluates one entry alongside whatever it needs, and returns its number. */
function computed(source: string, ...before: string[]): number {
  const items = workspace(
    ...before.map((text, index) => [`d${index}`, text] as [string, string]),
    ['it', source],
  );
  return valueOf(evaluateWorkspace(items), 'it');
}

describe('calculus over a function in the workspace', () => {
  it('integrates a definition between two limits', () => {
    expect(computed('p = integral(f, 0, 3)', 'f(x) = x^2')).toBeCloseTo(9, 9);
    expect(computed('p = integral(f, 0, pi)', 'f(x) = sin(x)')).toBeCloseTo(2, 9);
  });

  it('takes a built-in function by name', () => {
    expect(computed('p = integral(sin, 0, pi)')).toBeCloseTo(2, 9);
    expect(computed('p = root(sin, 3, 4)')).toBeCloseTo(Math.PI, 11);
    expect(computed('p = maximum(cos, -1, 1)')).toBeCloseTo(1, 12);
  });

  it('finds a root, an extremum and where it is', () => {
    expect(computed('p = root(f, 1, 2)', 'f(x) = x^2 - 2')).toBeCloseTo(Math.SQRT2, 11);
    expect(computed('p = minimum(f, -5, 5)', 'f(x) = (x - 2)^2 + 1')).toBeCloseTo(1, 12);
    expect(computed('p = argmin(f, -5, 5)', 'f(x) = (x - 2)^2 + 1')).toBeCloseTo(2, 7);
    expect(computed('p = maximum(f, 0, pi)', 'f(x) = sin(x)')).toBeCloseTo(1, 12);
    expect(computed('p = argmax(f, 0, pi)', 'f(x) = sin(x)')).toBeCloseTo(Math.PI / 2, 7);
  });

  it('reads a parameter of the workspace as a limit', () => {
    expect(computed('p = integral(f, 0, a)', 'a = 3', 'f(x) = x^2')).toBeCloseTo(9, 9);
  });

  it('follows a limit that changes', () => {
    const items = workspace(['a', 'a = 3'], ['f', 'f(x) = x^2'], ['p', 'p = integral(f, 0, a)']);
    const first = evaluateWorkspace(items);
    expect(valueOf(first, 'p')).toBeCloseTo(9, 9);

    const next = evaluateWorkspace(
      workspace(['a', 'a = 6'], ['f', 'f(x) = x^2'], ['p', 'p = integral(f, 0, a)']),
      first,
    );
    expect(valueOf(next, 'p')).toBeCloseTo(72, 8);
  });

  it('plots an antiderivative as a function of its upper limit', () => {
    const state = evaluateWorkspace(
      workspace(['f', 'f(x) = x^2'], ['g', 'y = integral(f, 0, x)']),
    );
    const curve = curveOf(state, 'g');
    expect(curve.evaluate(3)).toBeCloseTo(9, 9);
    expect(curve.evaluate(-3)).toBeCloseTo(-9, 9);
  });

  it('differentiates an antiderivative back into the integrand', () => {
    // The fundamental theorem, as a rule the differentiator can apply.
    const state = evaluateWorkspace(
      workspace(
        ['f', 'f(x) = sin(x) + x'],
        ['F', 'F(x) = integral(f, 0, x)'],
        ['p', "p = F'(2)"],
      ),
    );
    expect(valueOf(state, 'p')).toBeCloseTo(Math.sin(2) + 2, 12);
  });

  it('differentiates an integral with a moving lower limit too', () => {
    const state = evaluateWorkspace(
      workspace(['f', 'f(x) = x^2'], ['F', 'F(x) = integral(f, x, 5)'], ['p', "p = F'(3)"]),
    );
    // d/dx of the integral from x to 5 is -f(x).
    expect(valueOf(state, 'p')).toBeCloseTo(-9, 12);
  });

  it('is constant where neither limit moves', () => {
    const state = evaluateWorkspace(
      workspace(['f', 'f(x) = x^2'], ['F', 'F(t) = integral(f, 0, 3) + t'], ['p', "p = F'(1)"]),
    );
    expect(valueOf(state, 'p')).toBe(1);
  });
});

describe('calculus that cannot be carried out', () => {
  it('needs a function, written by name', () => {
    const state = evaluateWorkspace(
      workspace(['f', 'f(x) = x^2'], ['a', 'a = 2'], ['p', 'p = integral(a, 0, 1)']),
    );
    expect(messageOf(state, 'p')).toContain('"a" is not a function');
  });

  it('says so when the function is called rather than named', () => {
    const state = evaluateWorkspace(workspace(['f', 'f(x) = x^2'], ['p', 'integral(f(2), 0, 1)']));
    expect(messageOf(state, 'p')).toContain('write f, not f(...)');
  });

  it('needs a function of one variable', () => {
    const state = evaluateWorkspace(
      workspace(['g', 'g(x, y) = x y'], ['p', 'p = integral(g, 0, 1)']),
    );
    expect(messageOf(state, 'p')).toContain('function of one variable');
  });

  it('refuses a function that itself takes a function', () => {
    const state = evaluateWorkspace(workspace(['p', 'p = integral(integral, 0, 1)']));
    expect(messageOf(state, 'p')).toContain('takes a function of its own');
  });

  it('refuses an integrand with a pole inside the interval', () => {
    const state = evaluateWorkspace(
      workspace(['f', 'f(x) = 1/x'], ['p', 'p = integral(f, -1, 1)']),
    );
    expect(messageOf(state, 'p')).toContain('not defined everywhere');
  });

  it('refuses a root that is not bracketed', () => {
    const state = evaluateWorkspace(
      workspace(['f', 'f(x) = x^2 + 1'], ['p', 'p = root(f, -1, 1)']),
    );
    expect(messageOf(state, 'p')).toContain('same sign');
  });

  it('counts the function among the arguments', () => {
    const state = evaluateWorkspace(workspace(['f', 'f(x) = x'], ['p', 'p = integral(f, 0)']));
    expect(messageOf(state, 'p')).toBe('integral takes 3 arguments, but got 2');
  });
});
