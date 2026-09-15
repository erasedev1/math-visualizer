import { describe, expect, it } from 'vitest';
import { buildGraph, collectAffected, type GraphNode } from '@/core/workspace/graph';

const node = (id: string, ...dependencies: string[]): GraphNode => ({ id, dependencies });

/** Position of an id in the evaluation order. */
const at = (order: readonly string[], id: string) => order.indexOf(id);

describe('buildGraph', () => {
  it('orders every node after what it reads', () => {
    const graph = buildGraph([node('p', 'f'), node('f', 'a'), node('a')]);
    expect(graph.order).toHaveLength(3);
    expect(at(graph.order, 'a')).toBeLessThan(at(graph.order, 'f'));
    expect(at(graph.order, 'f')).toBeLessThan(at(graph.order, 'p'));
  });

  it('keeps independent nodes in the order they were given', () => {
    const graph = buildGraph([node('a'), node('b'), node('c')]);
    expect(graph.order).toEqual(['a', 'b', 'c']);
  });

  it('records dependents as the reverse of dependencies', () => {
    const graph = buildGraph([node('a'), node('f', 'a'), node('g', 'a', 'f')]);
    expect(graph.dependencies.get('g')).toEqual(['a', 'f']);
    expect([...(graph.dependents.get('a') ?? [])].sort()).toEqual(['f', 'g']);
    expect(graph.dependents.get('g')).toEqual([]);
  });

  it('ignores references to ids that are not in the workspace', () => {
    const graph = buildGraph([node('f', 'missing')]);
    expect(graph.dependencies.get('f')).toEqual([]);
    expect(graph.order).toEqual(['f']);
    expect(graph.cycles.size).toBe(0);
  });

  it('ignores duplicate references', () => {
    const graph = buildGraph([node('a'), node('f', 'a', 'a')]);
    expect(graph.dependencies.get('f')).toEqual(['a']);
    expect(graph.dependents.get('a')).toEqual(['f']);
  });

  it('detects a self-reference as a cycle', () => {
    const graph = buildGraph([node('f', 'f')]);
    expect(graph.cycles.has('f')).toBe(true);
    expect(graph.order).toEqual([]);
  });

  it('detects a two-node cycle', () => {
    const graph = buildGraph([node('a', 'b'), node('b', 'a')]);
    expect([...graph.cycles].sort()).toEqual(['a', 'b']);
    expect(graph.order).toEqual([]);
  });

  it('detects a longer cycle and spares unrelated nodes', () => {
    const graph = buildGraph([
      node('a', 'c'),
      node('b', 'a'),
      node('c', 'b'),
      node('free'),
    ]);
    expect([...graph.cycles].sort()).toEqual(['a', 'b', 'c']);
    expect(graph.order).toEqual(['free']);
  });

  it('marks nodes that merely read a cycle as broken too', () => {
    const graph = buildGraph([node('a', 'b'), node('b', 'a'), node('victim', 'a')]);
    expect(graph.cycles.has('victim')).toBe(true);
    expect(graph.order).not.toContain('victim');
  });

  it('handles a diamond without duplicating work', () => {
    const graph = buildGraph([node('top'), node('left', 'top'), node('right', 'top'), node('bottom', 'left', 'right')]);
    expect(graph.order).toHaveLength(4);
    expect(at(graph.order, 'top')).toBe(0);
    expect(at(graph.order, 'bottom')).toBe(3);
    expect(graph.cycles.size).toBe(0);
  });

  it('handles an empty workspace', () => {
    const graph = buildGraph([]);
    expect(graph.order).toEqual([]);
    expect(graph.cycles.size).toBe(0);
  });
});

describe('collectAffected', () => {
  const graph = buildGraph([
    node('a'),
    node('b'),
    node('f', 'a'),
    node('g', 'f'),
    node('p', 'b'),
  ]);

  it('returns the seed and everything that transitively reads it', () => {
    expect([...collectAffected(graph, ['a'])].sort()).toEqual(['a', 'f', 'g']);
  });

  it('leaves unrelated branches out', () => {
    const affected = collectAffected(graph, ['a']);
    expect(affected.has('b')).toBe(false);
    expect(affected.has('p')).toBe(false);
  });

  it('accepts several seeds', () => {
    expect([...collectAffected(graph, ['a', 'b'])].sort()).toEqual(['a', 'b', 'f', 'g', 'p']);
  });

  it('returns nothing for no seeds', () => {
    expect(collectAffected(graph, []).size).toBe(0);
  });

  it('terminates on a cyclic graph', () => {
    const cyclic = buildGraph([node('x', 'y'), node('y', 'x')]);
    expect([...collectAffected(cyclic, ['x'])].sort()).toEqual(['x', 'y']);
  });
});
