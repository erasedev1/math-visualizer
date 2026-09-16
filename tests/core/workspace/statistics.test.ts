import { describe, expect, it } from 'vitest';
import { evaluateWorkspace, type WorkspaceState } from '@/core/workspace/evaluate';
import { isGeometry } from '@/core/values/types';
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
  if (result.value.kind !== 'number') {
    throw new Error(`${id} holds ${result.value.kind}, not a number`);
  }
  return result.value.value;
}

function messageOf(state: WorkspaceState, id: string): string {
  const result = get(state, id);
  if (result.kind !== 'error') throw new Error(`${id} is ${result.kind}, not an error`);
  return result.message;
}

describe('statistics in a workspace', () => {
  it('reads a data set defined by name', () => {
    const state = evaluateWorkspace(
      workspace(['d', 'd = [2, 4, 4, 4, 5, 5, 7, 9]'], ['m', 'm = mean(d)'], ['s', 's = stddevp(d)']),
    );
    expect(valueOf(state, 'm')).toBe(5);
    expect(valueOf(state, 's')).toBe(2);
  });

  it('recomputes a statistic when the data it reads changes', () => {
    const first = evaluateWorkspace(workspace(['d', 'd = [1, 2, 3]'], ['m', 'm = mean(d)']));
    expect(valueOf(first, 'm')).toBe(2);

    const second = evaluateWorkspace(
      workspace(['d', 'd = [1, 2, 6]'], ['m', 'm = mean(d)']),
      first,
    );
    expect(valueOf(second, 'm')).toBe(3);
  });

  it('follows a slider through the data into the statistic', () => {
    const state = evaluateWorkspace(
      workspace(['a', 'a = 4'], ['d', 'd = [1, 2, a]'], ['m', 'm = mean(d)']),
    );
    expect(valueOf(state, 'm')).toBeCloseTo(7 / 3, 12);
  });
});

describe('a fit is an ordinary line', () => {
  const DATA = workspace(
    ['xs', 'xs = [1, 2, 3, 4, 5]'],
    ['ys', 'ys = [2, 4, 5, 4, 5]'],
    ['L', 'L = fit(xs, ys)'],
  );

  it('reaches the canvas as a drawable shape', () => {
    const state = evaluateWorkspace(DATA);
    const result = get(state, 'L');
    expect(result.kind).toBe('value');
    expect(result.kind === 'value' && result.value.kind).toBe('line');
    expect(result.kind === 'value' && isGeometry(result.value)).toBe(true);
  });

  it('has no literal to drag, because its position is a consequence', () => {
    const state = evaluateWorkspace(DATA);
    const result = get(state, 'L');
    expect(result.kind === 'value' && result.literal).toBeNull();
  });

  it('can be read and built on like any other line', () => {
    const state = evaluateWorkspace([
      ...DATA,
      ...workspace(
        ['k', 'k = slope(L)'],
        ['c', 'c = intercept(L)'],
        ['P', 'P = intersect(L, line((0, 0), (1, 0)))'],
      ),
    ]);
    expect(valueOf(state, 'k')).toBeCloseTo(0.6, 12);
    expect(valueOf(state, 'c')).toBeCloseTo(2.2, 12);
    // The line crosses y = 0 where 0.6x + 2.2 = 0.
    const crossing = get(state, 'P');
    expect(crossing.kind === 'value' && crossing.value.kind === 'point' && crossing.value.x).toBeCloseTo(
      -2.2 / 0.6,
      10,
    );
  });

  it('reports a refusal on the entry that caused it', () => {
    const state = evaluateWorkspace(
      workspace(['xs', 'xs = [2, 2, 2]'], ['ys', 'ys = [1, 2, 3]'], ['L', 'L = fit(xs, ys)']),
    );
    expect(messageOf(state, 'L')).toMatch(/vertical/);
    // The data itself is untouched by the failure downstream of it.
    expect(get(state, 'xs').kind).toBe('value');
  });
});
