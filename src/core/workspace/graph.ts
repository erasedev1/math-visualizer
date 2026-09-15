/**
 * Dependency graph over workspace items.
 *
 * This is the whole basis of reactivity: nothing in the application pushes
 * updates at anything else. An item declares what it reads, the graph decides
 * what order things are evaluated in and what a change can possibly affect,
 * and the evaluator recomputes exactly that set.
 *
 * The graph is plain data over ids, with no knowledge of expressions, so it
 * can be tested on its own and reused for geometry, tables and notebook
 * blocks later.
 */

export interface GraphNode {
  readonly id: string;
  /** Ids this node reads. Unknown ids are ignored. */
  readonly dependencies: readonly string[];
}

export interface DependencyGraph {
  readonly dependencies: ReadonlyMap<string, readonly string[]>;
  readonly dependents: ReadonlyMap<string, readonly string[]>;
  /**
   * Evaluation order: every node appears after everything it depends on.
   * Nodes in a cycle cannot be ordered and are left out.
   */
  readonly order: readonly string[];
  /** Nodes that are part of, or depend on, a dependency cycle. */
  readonly cycles: ReadonlySet<string>;
}

export function buildGraph(nodes: readonly GraphNode[]): DependencyGraph {
  const known = new Set(nodes.map((node) => node.id));
  const dependencies = new Map<string, readonly string[]>();
  const dependents = new Map<string, string[]>();

  for (const node of nodes) dependents.set(node.id, []);

  for (const node of nodes) {
    // Ignore references to ids that are not in the workspace, and any
    // duplicates, so the degree counts below stay accurate.
    const edges = [...new Set(node.dependencies)].filter(
      (id) => known.has(id) && id !== node.id,
    );
    dependencies.set(node.id, edges);
    for (const edge of edges) dependents.get(edge)?.push(node.id);
  }

  // A node depending on itself is a cycle of length one, which the filter
  // above removed from the edge lists; record it directly.
  const selfReferencing = nodes
    .filter((node) => node.dependencies.includes(node.id))
    .map((node) => node.id);

  const order = topologicalOrder(nodes, dependencies);
  const ordered = new Set(order);
  const cycles = new Set<string>(
    nodes.map((node) => node.id).filter((id) => !ordered.has(id)),
  );
  for (const id of selfReferencing) cycles.add(id);

  return {
    dependencies,
    dependents: new Map([...dependents].map(([id, list]) => [id, list])),
    // A self-referencing node is orderable but not evaluable; keep it out.
    order: order.filter((id) => !cycles.has(id)),
    cycles: closeOverDependents(cycles, dependents),
  };
}

/** Kahn's algorithm. Nodes left with unmet dependencies are in a cycle. */
function topologicalOrder(
  nodes: readonly GraphNode[],
  dependencies: ReadonlyMap<string, readonly string[]>,
): string[] {
  const remaining = new Map<string, number>();
  const waiting = new Map<string, string[]>();

  for (const node of nodes) {
    const edges = dependencies.get(node.id) ?? [];
    remaining.set(node.id, edges.length);
    for (const edge of edges) {
      const list = waiting.get(edge);
      if (list === undefined) waiting.set(edge, [node.id]);
      else list.push(node.id);
    }
  }

  // Seed with the nodes that read nothing, keeping the caller's order so that
  // evaluation is deterministic and matches the order on screen.
  const queue = nodes.map((node) => node.id).filter((id) => remaining.get(id) === 0);
  const order: string[] = [];

  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index]!;
    order.push(id);
    for (const dependent of waiting.get(id) ?? []) {
      const count = (remaining.get(dependent) ?? 0) - 1;
      remaining.set(dependent, count);
      if (count === 0) queue.push(dependent);
    }
  }

  return order;
}

/** Anything downstream of a broken node is broken too. */
function closeOverDependents(
  seeds: ReadonlySet<string>,
  dependents: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const result = new Set(seeds);
  const pending = [...seeds];
  while (pending.length > 0) {
    const id = pending.pop()!;
    for (const dependent of dependents.get(id) ?? []) {
      if (result.has(dependent)) continue;
      result.add(dependent);
      pending.push(dependent);
    }
  }
  return result;
}

/**
 * The seeds plus everything that transitively reads them: exactly the set a
 * change can affect, and therefore exactly what has to be recomputed.
 */
export function collectAffected(
  graph: DependencyGraph,
  seeds: Iterable<string>,
): Set<string> {
  return closeOverDependents(new Set(seeds), graph.dependents);
}
