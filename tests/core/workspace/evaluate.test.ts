import { describe, expect, it } from 'vitest';
import { evaluateWorkspace, type WorkspaceState } from '@/core/workspace/evaluate';
import type { ItemResult, WorkspaceItem } from '@/core/workspace/types';

/** Builds a workspace from `id: source` pairs, in order. */
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
  if (result.kind !== 'value') {
    throw new Error(`${id} is ${result.kind}: ${JSON.stringify(result)}`);
  }
  return result.value;
}

function curveOf(state: WorkspaceState, id: string) {
  const result = get(state, id);
  const curve = result.kind === 'curve' ? result.curve : result.kind === 'function' ? result.curve : null;
  if (curve === null) throw new Error(`${id} has no curve: ${JSON.stringify(result)}`);
  return curve;
}

function messageOf(state: WorkspaceState, id: string): string {
  const result = get(state, id);
  if (result.kind !== 'error') throw new Error(`${id} is ${result.kind}, not an error`);
  return result.message;
}

describe('evaluateWorkspace', () => {
  it('evaluates a standalone value', () => {
    const state = evaluateWorkspace(workspace(['a', 'a = 2']));
    expect(valueOf(state, 'a')).toBe(2);
    const result = get(state, 'a');
    expect(result.kind === 'value' && result.name).toBe('a');
    expect(result.kind === 'value' && result.literal).toBe(2);
  });

  it('marks a computed value as having no literal to drag', () => {
    const state = evaluateWorkspace(workspace(['a', 'a = 2'], ['p', 'p = a^2 + 1']));
    expect(valueOf(state, 'p')).toBe(5);
    const result = get(state, 'p');
    expect(result.kind === 'value' && result.literal).toBeNull();
  });

  it('treats a negated number as a literal', () => {
    const state = evaluateWorkspace(workspace(['a', 'a = -3.5']));
    const result = get(state, 'a');
    expect(result.kind === 'value' && result.literal).toBe(-3.5);
  });

  it('resolves a function against workspace variables', () => {
    const state = evaluateWorkspace(workspace(['a', 'a = 3'], ['f', 'f(x) = a x^2']));
    expect(curveOf(state, 'f').evaluate(2)).toBe(12);
  });

  it('lets a variable call a workspace function', () => {
    const state = evaluateWorkspace(workspace(['f', 'f(x) = x^2'], ['p', 'p = f(3)']));
    expect(valueOf(state, 'p')).toBe(9);
  });

  it('resolves definitions written out of order', () => {
    const state = evaluateWorkspace(workspace(['p', 'p = f(3)'], ['f', 'f(x) = a x'], ['a', 'a = 2']));
    expect(valueOf(state, 'p')).toBe(6);
  });

  it('propagates a change through the whole chain', () => {
    const first = evaluateWorkspace(workspace(['a', 'a = 2'], ['f', 'f(x) = a x^2'], ['p', 'p = f(3)']));
    expect(valueOf(first, 'p')).toBe(18);

    const second = evaluateWorkspace(
      workspace(['a', 'a = 5'], ['f', 'f(x) = a x^2'], ['p', 'p = f(3)']),
      first,
    );
    expect(valueOf(second, 'a')).toBe(5);
    expect(curveOf(second, 'f').evaluate(3)).toBe(45);
    expect(valueOf(second, 'p')).toBe(45);
  });

  it('recomputes only what the change can reach', () => {
    const items = workspace(
      ['a', 'a = 2'],
      ['b', 'b = 7'],
      ['f', 'f(x) = a x'],
      ['p', 'p = f(1)'],
      ['q', 'q = b + 1'],
    );
    const first = evaluateWorkspace(items);
    expect([...first.recomputed].sort()).toEqual(['a', 'b', 'f', 'p', 'q']);

    const changed = items.map((item) => (item.id === 'a' ? { ...item, source: 'a = 4' } : item));
    const second = evaluateWorkspace(changed, first);

    expect([...second.recomputed].sort()).toEqual(['a', 'f', 'p']);
    // Untouched items keep their exact previous result object.
    expect(second.results.get('b')).toBe(first.results.get('b'));
    expect(second.results.get('q')).toBe(first.results.get('q'));
  });

  it('recomputes nothing when nothing changed', () => {
    const items = workspace(['a', 'a = 2'], ['f', 'f(x) = a x']);
    const first = evaluateWorkspace(items);
    const second = evaluateWorkspace(items, first);
    expect([...second.recomputed]).toEqual([]);
    expect(second.results.get('f')).toBe(first.results.get('f'));
  });

  it('recomputes a reader when a name starts resolving to a definition', () => {
    const before = evaluateWorkspace(workspace(['f', 'f(x) = a x']));
    expect(messageOf(before, 'f')).toMatch(/Unknown name "a"/);

    const after = evaluateWorkspace(workspace(['f', 'f(x) = a x'], ['a', 'a = 3']), before);
    expect(after.recomputed.has('f')).toBe(true);
    expect(curveOf(after, 'f').evaluate(2)).toBe(6);
  });

  it('recomputes a reader when the definition it read disappears', () => {
    const before = evaluateWorkspace(workspace(['a', 'a = 3'], ['f', 'f(x) = a x']));
    const after = evaluateWorkspace(workspace(['f', 'f(x) = a x']), before);
    expect(messageOf(after, 'f')).toMatch(/Unknown name "a"/);
  });

  it('records dependencies in both directions', () => {
    const state = evaluateWorkspace(workspace(['a', 'a = 2'], ['f', 'f(x) = a x'], ['p', 'p = f(1)']));
    expect(get(state, 'f').dependencies).toEqual(['a']);
    expect(get(state, 'p').dependencies).toEqual(['f']);
    expect(state.graph.dependents.get('a')).toEqual(['f']);
  });

  it('plots a bare expression against x', () => {
    const state = evaluateWorkspace(workspace(['e', 'x^2']));
    const curve = curveOf(state, 'e');
    expect(curve.variable).toBe('x');
    expect(curve.evaluate(3)).toBe(9);
  });

  it('plots against a single unknown name, so t^2 works', () => {
    const state = evaluateWorkspace(workspace(['e', 't^3']));
    expect(curveOf(state, 'e').variable).toBe('t');
  });

  it('prefers x as the axis when other names are defined', () => {
    const state = evaluateWorkspace(workspace(['a', 'a = 2'], ['e', 'a sin(x)']));
    const curve = curveOf(state, 'e');
    expect(curve.variable).toBe('x');
    expect(curve.evaluate(Math.PI / 2)).toBeCloseTo(2, 12);
  });

  it('plots y = ... and keeps y out of the name table', () => {
    const state = evaluateWorkspace(workspace(['e', 'y = 2x + 5']));
    expect(curveOf(state, 'e').evaluate(1)).toBe(7);
    expect(state.names.has('y')).toBe(false);
  });

  it('plots a determined expression as a level line', () => {
    const state = evaluateWorkspace(workspace(['a', 'a = 2'], ['e', 'a + 1']));
    const curve = curveOf(state, 'e');
    expect(curve.evaluate(-100)).toBe(3);
    expect(curve.evaluate(100)).toBe(3);
  });

  it('updates an anonymous curve when a variable it reads changes', () => {
    const first = evaluateWorkspace(workspace(['a', 'a = 1'], ['e', 'a sin(x)']));
    expect(curveOf(first, 'e').evaluate(Math.PI / 2)).toBeCloseTo(1, 12);

    const second = evaluateWorkspace(workspace(['a', 'a = 4'], ['e', 'a sin(x)']), first);
    expect(curveOf(second, 'e').evaluate(Math.PI / 2)).toBeCloseTo(4, 12);
  });

  it('supports the brief\'s slider demo', () => {
    const state = evaluateWorkspace(
      workspace(['a', 'a = 2'], ['b', 'b = 3'], ['c', 'c = 0'], ['f', 'f(x) = a sin(b x + c)']),
    );
    const curve = curveOf(state, 'f');
    expect(curve.evaluate(Math.PI / 6)).toBeCloseTo(2 * Math.sin(3 * (Math.PI / 6)), 12);
  });

  it('keeps multi-parameter functions callable even though they cannot be drawn', () => {
    const state = evaluateWorkspace(workspace(['g', 'g(x, y) = x^2 + y^2'], ['p', 'p = g(3, 4)']));
    const g = get(state, 'g');
    expect(g.kind === 'function' && g.curve).toBeNull();
    expect(valueOf(state, 'p')).toBe(25);
  });

  it('reports a cycle instead of looping forever', () => {
    const state = evaluateWorkspace(workspace(['a', 'a = b + 1'], ['b', 'b = a + 1']));
    expect(messageOf(state, 'a')).toMatch(/depends on itself/);
    expect(messageOf(state, 'b')).toMatch(/depends on itself/);
  });

  it('reports a self-reference as a cycle', () => {
    const state = evaluateWorkspace(workspace(['f', 'f(x) = f(x) + 1']));
    expect(messageOf(state, 'f')).toMatch(/depends on itself/);
  });

  it('recovers once a cycle is broken', () => {
    const cyclic = evaluateWorkspace(workspace(['a', 'a = b'], ['b', 'b = a']));
    const fixed = evaluateWorkspace(workspace(['a', 'a = 1'], ['b', 'b = a']), cyclic);
    expect(valueOf(fixed, 'b')).toBe(1);
  });

  it('reports a duplicate name without breaking the first definition', () => {
    const state = evaluateWorkspace(workspace(['a', 'a = 2'], ['a2', 'a = 5'], ['p', 'p = a']));
    expect(valueOf(state, 'a')).toBe(2);
    expect(messageOf(state, 'a2')).toMatch(/already defined/);
    expect(valueOf(state, 'p')).toBe(2);
  });

  it('refuses to redefine a built-in function', () => {
    expect(messageOf(evaluateWorkspace(workspace(['s', 'sin = 2'])), 's')).toMatch(/built-in/);
  });

  it('reports unknown names', () => {
    const state = evaluateWorkspace(workspace(['e', 'a sin(b x + c)']));
    expect(messageOf(state, 'e')).toMatch(/"a", "b", "c"/);
  });

  it('reports a parse failure with a source range', () => {
    const state = evaluateWorkspace(workspace(['e', 'x^^2']));
    const result = get(state, 'e');
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.start).toBe(2);
    expect(result.end).toBe(3);
  });

  it('says vertical lines are not supported rather than misreading x', () => {
    expect(messageOf(evaluateWorkspace(workspace(['e', 'x = 3'])), 'e')).toMatch(/Vertical lines/);
  });

  it('treats a blank line as empty', () => {
    const state = evaluateWorkspace(workspace(['e', '   ']));
    expect(get(state, 'e').kind).toBe('empty');
  });

  it('shadows a variable with a function parameter of the same name', () => {
    const state = evaluateWorkspace(workspace(['a', 'a = 2'], ['f', 'f(a) = a^2']));
    expect(curveOf(state, 'f').evaluate(5)).toBe(25);
  });

  it('lets a user definition shadow a built-in constant', () => {
    const state = evaluateWorkspace(workspace(['e', 'e = 5'], ['p', 'p = e + 1']));
    expect(valueOf(state, 'p')).toBe(6);
  });

  it('distinguishes a call from a product by what is defined', () => {
    const asProduct = evaluateWorkspace(workspace(['a', 'a = 3'], ['e', 'a(x + 1)']));
    expect(curveOf(asProduct, 'e').evaluate(1)).toBe(6);

    const asCall = evaluateWorkspace(workspace(['a', 'a(x) = x + 1'], ['e', 'a(x + 1)']));
    expect(curveOf(asCall, 'e').evaluate(1)).toBe(3);
  });

  it('handles an empty workspace', () => {
    const state = evaluateWorkspace([]);
    expect(state.results.size).toBe(0);
    expect(state.graph.order).toEqual([]);
  });
});
