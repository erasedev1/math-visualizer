import {
  calledFunctions,
  freeVariables,
  type Expr,
} from '../expression/ast';
import { compile } from '../expression/compile';
import {
  parseDefinition,
  readDefinitionHeader,
  type Definition,
} from '../expression/definition';
import { describeError, isExpressionError } from '../expression/errors';
import {
  BUILTIN_CONSTANTS,
  BUILTIN_FUNCTIONS,
  type FunctionDefinition,
} from '../expression/functions';
import { toSource } from '../expression/print';
import { compileCurve, type PlottableCurve } from '../plot/curve';
import { evaluateValue } from '../values/evaluate';
import { VALUE_FUNCTIONS } from '../values/functions';
import { withArticle, type Value } from '../values/types';
import { buildGraph, collectAffected, type DependencyGraph } from './graph';
import type { ErrorResult, ItemResult, LiteralForm, WorkspaceItem } from './types';

/**
 * Evaluating a workspace.
 *
 * Reactivity lives here and nowhere else: an item never tells another item to
 * update. Each pass derives what every item reads, orders the work so that
 * dependencies come first, and recomputes only the items a change can reach.
 * Everything else is reused from the previous pass, including its compiled
 * closures, which is what keeps a dragged slider cheap no matter how large the
 * workspace grows.
 */

/** The plane's coordinates are not available as variable names. */
export const HORIZONTAL_AXIS = 'x';
export const VERTICAL_AXIS = 'y';

export interface WorkspaceState {
  readonly items: readonly WorkspaceItem[];
  readonly results: ReadonlyMap<string, ItemResult>;
  readonly graph: DependencyGraph;
  /** Defined name to the id of the item that defines it. */
  readonly names: ReadonlyMap<string, string>;
  /** Ids recomputed in this pass, for diagnostics and tests. */
  readonly recomputed: ReadonlySet<string>;
  /** Internal: parsed sources kept for reuse across passes. */
  readonly parsed: ReadonlyMap<string, ParsedItem>;
}

export const EMPTY_WORKSPACE: WorkspaceState = {
  items: [],
  results: new Map(),
  graph: buildGraph([]),
  names: new Map(),
  recomputed: new Set(),
  parsed: new Map(),
};

interface ParsedItem {
  readonly source: string;
  /** The set of function names in force when this was parsed. */
  readonly functionKey: string;
  readonly definition: Definition | null;
  readonly error: ErrorResult | null;
  readonly dependencies: readonly string[];
  /** Free names that no definition supplies. */
  readonly unresolved: readonly string[];
}

export function evaluateWorkspace(
  items: readonly WorkspaceItem[],
  previous: WorkspaceState = EMPTY_WORKSPACE,
): WorkspaceState {
  const { names, functionNames, duplicates } = readHeaders(items);
  const functionKey = [...functionNames].sort().join(',');
  const isFunction = (name: string) =>
    functionNames.has(name) || isBuiltinFunction(name);

  const parsed = new Map<string, ParsedItem>();
  for (const item of items) {
    parsed.set(item.id, parseItem(item, { names, isFunction, previous, functionKey }));
  }

  const graph = buildGraph(
    items.map((item) => ({
      id: item.id,
      dependencies: parsed.get(item.id)?.dependencies ?? [],
    })),
  );

  const affected = collectAffected(graph, staleItems(items, parsed, graph, previous));

  const results = new Map<string, ItemResult>();
  const recomputed = new Set<string>();

  // One mutable scope, extended as the topological order is walked. The
  // compiler reads it at compile time, so items compiled earlier keep the
  // values they were compiled against.
  const constants: Record<string, number> = { ...BUILTIN_CONSTANTS };
  const functions = new Map(BUILTIN_FUNCTIONS);
  const values = new Map<string, Value>();

  const byId = new Map(items.map((item) => [item.id, item]));

  for (const id of graph.order) {
    const item = byId.get(id);
    const entry = parsed.get(id);
    if (item === undefined || entry === undefined) continue;

    const reusable =
      !affected.has(id) && previous.results.get(id) !== undefined
        ? previous.results.get(id)!
        : null;

    const result =
      reusable ??
      evaluateItem(item, entry, {
        duplicate: duplicates.get(id) ?? null,
        constants,
        functions,
        values,
        results,
      });

    if (reusable === null) recomputed.add(id);
    results.set(id, result);
    publish(result, constants, functions, values);
  }

  for (const id of graph.cycles) {
    const entry = parsed.get(id);
    results.set(id, {
      kind: 'error',
      id,
      dependencies: entry?.dependencies ?? [],
      message: 'This definition depends on itself, directly or through others',
    });
    recomputed.add(id);
  }

  return { items, results, graph, names, recomputed, parsed };
}

/** True for any name the language already provides. */
export function isBuiltinFunction(name: string): boolean {
  return BUILTIN_FUNCTIONS.has(name) || VALUE_FUNCTIONS.has(name);
}

/** Adds a finished item's name to the scope later items are compiled against. */
function publish(
  result: ItemResult,
  constants: Record<string, number>,
  functions: Map<string, FunctionDefinition>,
  values: Map<string, Value>,
): void {
  if (result.kind === 'value') {
    if (result.name === null) return;
    values.set(result.name, result.value);
    // Only numbers reach the compiled numeric path that plotting uses.
    if (result.value.kind === 'number') constants[result.name] = result.value.value;
    return;
  }
  if (result.kind === 'function') {
    const { name, params, call } = result;
    functions.set(name, {
      name,
      minArgs: params.length,
      maxArgs: params.length,
      apply: call,
      signature: `${name}(${params.join(', ')})`,
      description: 'Defined in this workspace',
    });
  }
}

interface Headers {
  readonly names: ReadonlyMap<string, string>;
  readonly functionNames: ReadonlySet<string>;
  /** Id of an item whose name was already taken, mapped to the winning id. */
  readonly duplicates: ReadonlyMap<string, string>;
}

/**
 * Collects the names every line defines, before any body is parsed.
 *
 * Parsing needs to know which names are functions, so that `f(2)` reads as a
 * call rather than as a product, and that is only knowable once every header
 * has been seen.
 */
function readHeaders(items: readonly WorkspaceItem[]): Headers {
  const names = new Map<string, string>();
  const functionNames = new Set<string>();
  const duplicates = new Map<string, string>();

  for (const item of items) {
    const header = readDefinitionHeader(item.source);
    if (header === null) continue;
    if (header.name === HORIZONTAL_AXIS || header.name === VERTICAL_AXIS) continue;

    const owner = names.get(header.name);
    if (owner !== undefined) {
      duplicates.set(item.id, owner);
      continue;
    }

    names.set(header.name, item.id);
    if (header.kind === 'function') functionNames.add(header.name);
  }

  return { names, functionNames, duplicates };
}

interface ParseContext {
  readonly names: ReadonlyMap<string, string>;
  readonly isFunction: (name: string) => boolean;
  readonly previous: WorkspaceState;
  readonly functionKey: string;
}

function parseItem(item: WorkspaceItem, context: ParseContext): ParsedItem {
  const cached = context.previous.parsed.get(item.id);
  if (
    cached !== undefined &&
    cached.source === item.source &&
    cached.functionKey === context.functionKey
  ) {
    // Re-resolve names, which may point at different items than last time.
    const { dependencies, unresolved } = resolve(cached.definition, context.names);
    return { ...cached, dependencies, unresolved };
  }

  if (item.source.trim() === '') {
    return {
      source: item.source,
      functionKey: context.functionKey,
      definition: null,
      error: null,
      dependencies: [],
      unresolved: [],
    };
  }

  try {
    const definition = parseDefinition(item.source, { isFunction: context.isFunction });
    const { dependencies, unresolved } = resolve(definition, context.names);
    return {
      source: item.source,
      functionKey: context.functionKey,
      definition,
      error: null,
      dependencies,
      unresolved,
    };
  } catch (error) {
    return {
      source: item.source,
      functionKey: context.functionKey,
      definition: null,
      error: toErrorResult(item.id, [], error),
      dependencies: [],
      unresolved: [],
    };
  }
}

/** Splits a definition's free names into workspace references and unknowns. */
function resolve(
  definition: Definition | null,
  names: ReadonlyMap<string, string>,
): { dependencies: string[]; unresolved: string[] } {
  if (definition === null) return { dependencies: [], unresolved: [] };

  const local = definition.kind === 'function' ? definition.params : [];
  const known = [...local, ...Object.keys(BUILTIN_CONSTANTS)];
  const referenced = [
    ...freeVariables(definition.body, known),
    ...calledFunctions(definition.body).filter((name) => !isBuiltinFunction(name)),
  ];

  const dependencies: string[] = [];
  const unresolved: string[] = [];
  for (const name of new Set(referenced)) {
    const id = names.get(name);
    if (id === undefined) unresolved.push(name);
    else dependencies.push(id);
  }
  return { dependencies, unresolved };
}

/** Items that cannot reuse their previous result and must be recomputed. */
function staleItems(
  items: readonly WorkspaceItem[],
  parsed: ReadonlyMap<string, ParsedItem>,
  graph: DependencyGraph,
  previous: WorkspaceState,
): string[] {
  const stale: string[] = [];
  const previousSources = new Map(previous.items.map((item) => [item.id, item.source]));

  for (const item of items) {
    const before = previousSources.get(item.id);
    if (before === undefined || before !== item.source) {
      stale.push(item.id);
      continue;
    }
    if (previous.results.get(item.id) === undefined) {
      stale.push(item.id);
      continue;
    }
    // The text is unchanged, but the names in it may now resolve elsewhere.
    const dependencies = parsed.get(item.id)?.dependencies ?? [];
    const dependedOn = previous.graph.dependencies.get(item.id) ?? [];
    if (!sameIds(dependencies, dependedOn)) {
      stale.push(item.id);
      continue;
    }
    if (graph.cycles.has(item.id) !== previous.graph.cycles.has(item.id)) {
      stale.push(item.id);
    }
  }

  return stale;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((id) => set.has(id));
}

interface EvaluationContext {
  readonly duplicate: string | null;
  readonly constants: Readonly<Record<string, number>>;
  readonly functions: ReadonlyMap<string, FunctionDefinition>;
  readonly values: ReadonlyMap<string, Value>;
  readonly results: ReadonlyMap<string, ItemResult>;
}

function evaluateItem(
  item: WorkspaceItem,
  entry: ParsedItem,
  context: EvaluationContext,
): ItemResult {
  const { id } = item;
  const dependencies = entry.dependencies;

  if (entry.error !== null) return { ...entry.error, dependencies };
  if (entry.definition === null) return { kind: 'empty', id, dependencies };

  const definition = entry.definition;
  const scope = { constants: context.constants, functions: context.functions };

  if (definition.kind !== 'expression') {
    if (context.duplicate !== null) {
      return error(id, dependencies, `"${definition.name}" is already defined above`);
    }
    if (BUILTIN_FUNCTIONS.has(definition.name)) {
      return error(
        id,
        dependencies,
        `"${definition.name}" is a built-in function and cannot be redefined`,
      );
    }
  }

  try {
    switch (definition.kind) {
      case 'function': {
        const unknown = entry.unresolved;
        if (unknown.length > 0) return unknownNames(id, dependencies, unknown);
        const nonNumeric = firstNonNumericDependency(dependencies, context);
        if (nonNumeric !== null) return nonNumeric(id, dependencies);
        const compiled = compile(definition.body, { ...scope, params: definition.params });
        const [only] = definition.params;
        return {
          kind: 'function',
          id,
          dependencies,
          name: definition.name,
          params: definition.params,
          call: (args) => compiled(args),
          curve:
            definition.params.length === 1 && only !== undefined
              ? compileCurve(
                  definition.body,
                  only,
                  `${definition.name}(${only})`,
                  scope,
                )
              : null,
        };
      }

      case 'variable': {
        // `y = ...` is the conventional way to write a graph, and `x = ...`
        // would be a vertical line, which is not a function of x.
        if (definition.name === VERTICAL_AXIS) {
          return asCurve(id, dependencies, definition.body, entry.unresolved, VERTICAL_AXIS, scope);
        }
        if (definition.name === HORIZONTAL_AXIS) {
          return error(
            id,
            dependencies,
            'Vertical lines are not supported yet; "x" names the horizontal axis',
          );
        }
        if (entry.unresolved.length > 0) {
          return unknownNames(id, dependencies, entry.unresolved);
        }
        return asValue(id, dependencies, definition.name, definition.body, context);
      }

      case 'expression':
        // A name still free is the axis the expression is graphed against;
        // an expression with nothing free is a value the workspace can hold.
        return entry.unresolved.length > 0
          ? asCurve(
              id,
              dependencies,
              definition.body,
              entry.unresolved,
              toSource(definition.body),
              scope,
            )
          : asValue(id, dependencies, null, definition.body, context);
    }
  } catch (caught) {
    return toErrorResult(id, dependencies, caught);
  }
}

/** Evaluates a fully determined expression to a number, a point or a shape. */
function asValue(
  id: string,
  dependencies: readonly string[],
  name: string | null,
  body: Expr,
  context: EvaluationContext,
): ItemResult {
  const value = evaluateValue(body, {
    values: context.values,
    constants: context.constants,
    functions: context.functions,
  });
  return { kind: 'value', id, dependencies, name, value, literal: literalForm(body) };
}

/**
 * A curve is compiled on the unboxed numeric path, so a name bound to a point
 * or a shape cannot appear in one. Saying which name, and what it is, beats
 * the compiler's "unknown name".
 */
function firstNonNumericDependency(
  dependencies: readonly string[],
  context: EvaluationContext,
): ((id: string, dependencies: readonly string[]) => ErrorResult) | null {
  for (const dependency of dependencies) {
    const result = context.results.get(dependency);
    if (result?.kind !== 'value' || result.value.kind === 'number') continue;
    const described = withArticle(result.value.kind);
    const label = result.name ?? 'a value';
    return (id, deps) =>
      error(
        id,
        deps,
        `This reads "${label}", which is ${described}; curves are functions of numbers for now`,
      );
  }
  return null;
}

/**
 * Graphs an expression against its single unknown name, so `t^2` plots as
 * readily as `x^2` and a fully determined expression plots as a level line.
 */
function asCurve(
  id: string,
  dependencies: readonly string[],
  body: Expr,
  unresolved: readonly string[],
  label: string,
  scope: { constants: Readonly<Record<string, number>>; functions: ReadonlyMap<string, FunctionDefinition> },
): ItemResult {
  const axis = unresolved.includes(HORIZONTAL_AXIS)
    ? HORIZONTAL_AXIS
    : unresolved[0] ?? HORIZONTAL_AXIS;
  const unknown = unresolved.filter((name) => name !== axis);
  if (unknown.length > 0) return unknownNames(id, dependencies, unknown);

  return {
    kind: 'curve',
    id,
    dependencies,
    curve: compileCurve(body, axis, label, scope),
  };
}

/** The literal written in the source, when the body is nothing but one. */
function literalForm(body: Expr): LiteralForm | null {
  const asNumber = literalNumber(body);
  if (asNumber !== null) return { kind: 'number', value: asNumber };

  if (body.type === 'Tuple' && body.elements.length === 2) {
    const [first, second] = body.elements as [Expr, Expr];
    const x = literalNumber(first);
    const y = literalNumber(second);
    if (x !== null && y !== null) return { kind: 'point', x, y };
  }

  return null;
}

/** The number written in the source, when the expression is nothing but one. */
function literalNumber(body: Expr): number | null {
  if (body.type === 'Number') return body.value;
  if (body.type === 'Unary' && body.argument.type === 'Number') {
    return body.operator === '-' ? -body.argument.value : body.argument.value;
  }
  return null;
}

function unknownNames(
  id: string,
  dependencies: readonly string[],
  names: readonly string[],
): ErrorResult {
  const list = [...names].sort();
  const message =
    list.length === 1
      ? `Unknown name "${list[0]}"; define it to use it here`
      : `Unknown names: ${list.map((name) => `"${name}"`).join(', ')}`;
  return error(id, dependencies, message);
}

function error(id: string, dependencies: readonly string[], message: string): ErrorResult {
  return { kind: 'error', id, dependencies, message };
}

function toErrorResult(
  id: string,
  dependencies: readonly string[],
  caught: unknown,
): ErrorResult {
  if (isExpressionError(caught) && caught.end > caught.start) {
    return {
      kind: 'error',
      id,
      dependencies,
      message: caught.message,
      start: caught.start,
      end: caught.end,
    };
  }
  return error(id, dependencies, describeError(caught));
}

export type { PlottableCurve };
