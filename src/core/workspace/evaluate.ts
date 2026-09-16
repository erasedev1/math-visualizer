import {
  calledFunctions,
  freeVariables,
  identifiers,
  type Expr,
} from '../expression/ast';
import {
  definedFunctionRule,
  derive,
  deriveNamedFunction,
  primedName,
  splitPrimes,
} from '../calculus';
import { compile } from '../expression/compile';
import {
  parseDefinition,
  readDefinitionHeader,
  type Definition,
} from '../expression/definition';
import { describeError, isExpressionError } from '../expression/errors';
import {
  arityMessage,
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
import type {
  DerivedFunction,
  ErrorResult,
  ItemResult,
  LiteralForm,
  WorkspaceItem,
} from './types';

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

/**
 * How many primes a name may carry.
 *
 * Not a limit of the differentiator but of good sense: each derivative can be
 * larger than the last, and `f''''''''''` is more likely a stuck key than a
 * tenth derivative. Six covers what is written on purpose.
 */
export const MAX_DERIVATIVE_ORDER = 6;

export interface WorkspaceState {
  readonly items: readonly WorkspaceItem[];
  readonly results: ReadonlyMap<string, ItemResult>;
  readonly graph: DependencyGraph;
  /** Defined name to the id of the item that defines it. */
  readonly names: ReadonlyMap<string, string>;
  /** Ids recomputed in this pass, for diagnostics and tests. */
  readonly recomputed: ReadonlySet<string>;
  /** The highest derivative of each name prime notation asked for in this pass. */
  readonly derivativeOrders: ReadonlyMap<string, number>;
  /** Internal: parsed sources kept for reuse across passes. */
  readonly parsed: ReadonlyMap<string, ParsedItem>;
}

export const EMPTY_WORKSPACE: WorkspaceState = {
  items: [],
  results: new Map(),
  graph: buildGraph([]),
  names: new Map(),
  recomputed: new Set(),
  derivativeOrders: new Map(),
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
  /** Names written with primes, such as `f'`, whatever they turn out to mean. */
  readonly primed: readonly string[];
}

export function evaluateWorkspace(
  items: readonly WorkspaceItem[],
  previous: WorkspaceState = EMPTY_WORKSPACE,
): WorkspaceState {
  const { names, functionArity, duplicates } = readHeaders(items);
  const functionKey = [...functionArity]
    .map(([name, arity]) => `${name}/${arity}`)
    .sort()
    .join(',');
  const isFunction = (name: string) =>
    functionArity.has(name) || isBuiltinFunction(name) || isDerivable(name, functionArity);

  const parsed = new Map<string, ParsedItem>();
  for (const item of items) {
    parsed.set(item.id, parseItem(item, { names, isFunction, previous, functionKey }));
  }

  // Which derivatives to produce is a property of the whole workspace: `f'`
  // exists because some entry writes it, and the entry that defines `f` is not
  // the one that knows.
  const requested = requestedDerivatives(parsed, functionArity);

  const graph = buildGraph(
    items.map((item) => ({
      id: item.id,
      dependencies: parsed.get(item.id)?.dependencies ?? [],
    })),
  );

  const stale = staleItems(items, parsed, graph, previous);
  // A definition carries its own derivatives, so it has to be recomputed when
  // the workspace starts or stops asking for them — and only then.
  for (const item of items) {
    const definition = parsed.get(item.id)?.definition;
    if (definition?.kind !== 'function') continue;
    const before = previous.derivativeOrders.get(definition.name) ?? 0;
    if (before !== (requested.get(definition.name) ?? 0)) stale.push(item.id);
  }

  const affected = collectAffected(graph, stale);

  const results = new Map<string, ItemResult>();
  const recomputed = new Set<string>();

  // One mutable scope, extended as the topological order is walked. The
  // compiler reads it at compile time, so items compiled earlier keep the
  // values they were compiled against.
  const constants: Record<string, number> = { ...BUILTIN_CONSTANTS };
  const functions = new Map(BUILTIN_FUNCTIONS);
  const values = new Map<string, Value>();

  // How many derivatives each base name can supply, and why not more. Filled
  // for built-ins now and for defined functions as they are published, so the
  // entry that writes `f'` finds one answer wherever `f` came from.
  const derivatives = new Map<string, DerivativeSupply>();
  for (const [base, order] of requested) {
    if (names.has(base)) continue;
    if (BUILTIN_FUNCTIONS.has(base)) {
      derivatives.set(base, registerBuiltinDerivatives(functions, constants, base, order));
    }
  }

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
        names,
        requested,
        derivatives,
      });

    if (reusable === null) recomputed.add(id);
    results.set(id, result);
    publish(result, constants, functions, values, derivatives);
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

  return {
    items,
    results,
    graph,
    names,
    recomputed,
    derivativeOrders: requested,
    parsed,
  };
}

/**
 * Whether a primed name can mean anything: prime notation is for functions of
 * one variable, whether the workspace defines them or the language does.
 */
function isDerivable(name: string, functionArity: ReadonlyMap<string, number>): boolean {
  const { base, order } = splitPrimes(name);
  if (order === 0) return false;
  if (functionArity.has(base)) return functionArity.get(base) === 1;
  const builtin = BUILTIN_FUNCTIONS.get(base);
  return builtin !== undefined && builtin.minArgs === 1 && builtin.maxArgs === 1;
}

/** The highest derivative of each base name that some entry asks for. */
function requestedDerivatives(
  parsed: ReadonlyMap<string, ParsedItem>,
  functionArity: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> {
  const requested = new Map<string, number>();
  for (const entry of parsed.values()) {
    for (const name of entry.primed) {
      if (!isDerivable(name, functionArity)) continue;
      const { base, order } = splitPrimes(name);
      const capped = Math.min(order, MAX_DERIVATIVE_ORDER);
      requested.set(base, Math.max(requested.get(base) ?? 0, capped));
    }
  }
  return requested;
}

/** How many derivatives of a name are available, and why there are no more. */
interface DerivativeSupply {
  readonly available: number;
  readonly error: string | null;
}

/**
 * Registers `sin'`, `sin''` and the like.
 *
 * The body is built by differentiating `sin(x)`, which sends the work through
 * the registry's own rule: a built-in and a defined function are differentiated
 * by one mechanism, not two.
 */
function registerBuiltinDerivatives(
  functions: Map<string, FunctionDefinition>,
  constants: Readonly<Record<string, number>>,
  base: string,
  order: number,
): DerivativeSupply {
  const variable = HORIZONTAL_AXIS;
  let available = 0;
  for (let k = 1; k <= order; k += 1) {
    try {
      const body = deriveNamedFunction(base, variable, k, functions);
      registerFunction(functions, primedName(base, k), [variable], body, {
        constants,
        functions,
      });
      available = k;
    } catch (caught) {
      return { available, error: unavailable(base, k, caught) };
    }
  }
  return { available, error: null };
}

/** Compiles a body and registers it under a name, derivative rule included. */
function registerFunction(
  functions: Map<string, FunctionDefinition>,
  name: string,
  params: readonly string[],
  body: Expr,
  scope: CompileScope,
): void {
  functions.set(name, {
    name,
    minArgs: params.length,
    maxArgs: params.length,
    apply: compile(body, { ...scope, params }),
    signature: `${name}(${params.join(', ')})`,
    description: 'Defined in this workspace',
    derivative: definedFunctionRule(params, body, functions),
  });
}

function unavailable(base: string, order: number, caught: unknown): string {
  return `${primedName(base, order)} is not available: ${describeError(caught)}`;
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
  derivatives: Map<string, DerivativeSupply>,
): void {
  if (result.kind === 'value') {
    if (result.name === null) return;
    values.set(result.name, result.value);
    // Only numbers reach the compiled numeric path that plotting uses.
    if (result.value.kind === 'number') constants[result.name] = result.value.value;
    return;
  }
  if (result.kind === 'function') {
    const { name, params, call, body } = result;
    functions.set(name, {
      name,
      minArgs: params.length,
      maxArgs: params.length,
      apply: call,
      signature: `${name}(${params.join(', ')})`,
      description: 'Defined in this workspace',
      // A function can be differentiated through, so `g(x) = f(x)^2` has a
      // derivative as soon as `f` does.
      derivative: definedFunctionRule(params, body, functions),
    });

    for (const derivative of result.derivatives) {
      functions.set(derivative.name, {
        name: derivative.name,
        minArgs: 1,
        maxArgs: 1,
        apply: derivative.call,
        signature: `${derivative.name}(${params[0] ?? HORIZONTAL_AXIS})`,
        description: `The derivative of ${name}`,
        derivative: definedFunctionRule(params, derivative.body, functions),
      });
    }

    derivatives.set(name, {
      available: result.derivatives.length,
      error: result.derivativeError,
    });
  }
}

interface Headers {
  readonly names: ReadonlyMap<string, string>;
  /** Each defined function's name, mapped to how many parameters it takes. */
  readonly functionArity: ReadonlyMap<string, number>;
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
  const functionArity = new Map<string, number>();
  const duplicates = new Map<string, string>();

  for (const item of items) {
    const header = readDefinitionHeader(item.source);
    if (header === null) continue;
    if (header.name === HORIZONTAL_AXIS || header.name === VERTICAL_AXIS) continue;
    // `f'` is what `f` differentiates to, so it defines nothing of its own;
    // the entry that tries says so when it is evaluated.
    if (splitPrimes(header.name).order > 0) continue;

    const owner = names.get(header.name);
    if (owner !== undefined) {
      duplicates.set(item.id, owner);
      continue;
    }

    names.set(header.name, item.id);
    if (header.kind === 'function') functionArity.set(header.name, header.params.length);
  }

  return { names, functionArity, duplicates };
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
      primed: [],
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
      primed: primedReferences(definition),
    };
  } catch (error) {
    return {
      source: item.source,
      functionKey: context.functionKey,
      definition: null,
      error: toErrorResult(item.id, [], error),
      dependencies: [],
      unresolved: [],
      primed: [],
    };
  }
}

/** Every name in a body written with primes, called or not. */
function primedReferences(definition: Definition): string[] {
  const referenced = [
    ...identifiers(definition.body),
    ...calledFunctions(definition.body),
  ];
  return [...new Set(referenced.filter((name) => splitPrimes(name).order > 0))];
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
    ...calledFunctions(definition.body),
  ];

  const dependencies = new Set<string>();
  const unresolved = new Set<string>();
  for (const name of new Set(referenced)) {
    // `f'` reads whatever defines `f`: the derivative is not a separate entry,
    // so it depends on, and changes with, the definition it came from.
    const { base } = splitPrimes(name);
    const owner = names.get(base);
    if (owner !== undefined) {
      dependencies.add(owner);
      continue;
    }
    // A name the language itself supplies is neither a dependency nor unknown.
    // That includes one written without brackets, as `integral(sin, 0, pi)`
    // does, which is a use of `sin` rather than a call to it.
    if (isBuiltinFunction(base)) continue;
    unresolved.add(base);
  }
  return { dependencies: [...dependencies], unresolved: [...unresolved] };
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

/** What an expression is compiled against. */
interface CompileScope {
  readonly constants: Readonly<Record<string, number>>;
  readonly functions: ReadonlyMap<string, FunctionDefinition>;
}

interface EvaluationContext extends CompileScope {
  readonly duplicate: string | null;
  readonly values: ReadonlyMap<string, Value>;
  readonly results: ReadonlyMap<string, ItemResult>;
  readonly names: ReadonlyMap<string, string>;
  /** The highest derivative of each name the workspace asks for. */
  readonly requested: ReadonlyMap<string, number>;
  readonly derivatives: ReadonlyMap<string, DerivativeSupply>;
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
    const { base, order } = splitPrimes(definition.name);
    if (order > 0) {
      return error(
        id,
        dependencies,
        `"${definition.name}" cannot be defined: it already means the derivative of "${base}"`,
      );
    }
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

  const missing = missingDerivative(entry.primed, context);
  if (missing !== null) return error(id, dependencies, missing);

  try {
    switch (definition.kind) {
      case 'function': {
        const unknown = entry.unresolved;
        if (unknown.length > 0) return unknownNames(id, dependencies, unknown);
        const nonNumeric = firstNonNumericDependency(dependencies, context);
        if (nonNumeric !== null) return nonNumeric(id, dependencies);
        const compiled = compile(definition.body, { ...scope, params: definition.params });
        const [only] = definition.params;
        const derived = deriveFunction(
          definition.name,
          definition.params,
          definition.body,
          context.requested.get(definition.name) ?? 0,
          scope,
        );
        return {
          kind: 'function',
          id,
          dependencies,
          name: definition.name,
          params: definition.params,
          body: definition.body,
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
          derivatives: derived.functions,
          derivativeError: derived.error,
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

/**
 * Differentiates a definition as many times as some entry asked for.
 *
 * The derivative is taken of the body directly rather than of a call to the
 * function, which is the same expression and needs no substitution: the body is
 * already written in terms of the parameter.
 */
function deriveFunction(
  name: string,
  params: readonly string[],
  body: Expr,
  order: number,
  scope: CompileScope,
): { functions: DerivedFunction[]; error: string | null } {
  const [variable] = params;
  if (order === 0 || variable === undefined || params.length !== 1) {
    return { functions: [], error: null };
  }

  const functions: DerivedFunction[] = [];
  let derived = body;
  for (let k = 1; k <= order; k += 1) {
    try {
      derived = derive(derived, variable, { functions: scope.functions });
      const compiled = compile(derived, { ...scope, params: [variable] });
      functions.push({
        name: primedName(name, k),
        order: k,
        body: derived,
        call: (args) => compiled(args),
      });
    } catch (caught) {
      return { functions, error: unavailable(name, k, caught) };
    }
  }
  return { functions, error: null };
}

/**
 * Why a primed name written in this entry has no meaning, if it has none.
 *
 * The failure belongs here rather than on the definition: `f(x) = floor(x)` is
 * a perfectly good function, and it is the entry asking for `f'` that is
 * asking for something that does not exist.
 */
function missingDerivative(
  primed: readonly string[],
  context: EvaluationContext,
): string | null {
  for (const written of primed) {
    const { base, order } = splitPrimes(written);
    if (order > MAX_DERIVATIVE_ORDER) {
      return `"${written}" asks for derivative number ${order}; at most ${MAX_DERIVATIVE_ORDER} are available`;
    }

    const owner = context.names.get(base);
    if (owner !== undefined) {
      const defined = context.results.get(owner);
      if (defined?.kind === 'value') {
        return `"${base}" is a value, not a function, so "${written}" has no meaning`;
      }
      if (defined?.kind === 'function' && defined.params.length !== 1) {
        return `Prime notation is for functions of one variable, and ${base} takes ${defined.params.length}`;
      }
    } else if (!isBuiltinFunction(base)) {
      // Said here rather than left to the compiler, which would report the
      // primed spelling and suggest defining something that cannot be defined.
      return describeUnknown([base]);
    } else {
      const builtin = BUILTIN_FUNCTIONS.get(base);
      if (builtin === undefined) {
        return `"${base}" is not a function of one number, so "${written}" has no meaning`;
      }
      if (builtin.minArgs !== 1 || builtin.maxArgs !== 1) {
        // `log` has a derivative but takes an optional base, so a prime on it
        // would not say which function is meant.
        return `Prime notation is for functions of one variable, and ${arityMessage(builtin)}`;
      }
    }

    const supply = context.derivatives.get(base);
    if (supply === undefined || supply.available < order) {
      return supply?.error ?? `${base} has no derivative`;
    }
  }
  return null;
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
  scope: CompileScope,
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

  if (body.type === 'Vector') {
    const components = literalNumbers(body.elements);
    if (components !== null) return { kind: 'vector', components };
  }

  if (body.type === 'List' && body.elements.length > 0) {
    const flat = literalNumbers(body.elements);
    if (flat !== null) return { kind: 'matrix', rows: [flat] };

    const rows: number[][] = [];
    for (const element of body.elements) {
      if (element.type !== 'List') return null;
      const row = literalNumbers(element.elements);
      if (row === null || row.length === 0) return null;
      rows.push(row);
    }
    const width = rows[0]?.length ?? 0;
    if (width > 0 && rows.every((row) => row.length === width)) {
      return { kind: 'matrix', rows };
    }
  }

  return null;
}

/** All-or-nothing: every element must itself be a plain number. */
function literalNumbers(elements: readonly Expr[]): number[] | null {
  const numbers: number[] = [];
  for (const element of elements) {
    const value = literalNumber(element);
    if (value === null) return null;
    numbers.push(value);
  }
  return numbers;
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
  return error(id, dependencies, describeUnknown(names));
}

function describeUnknown(names: readonly string[]): string {
  const list = [...names].sort();
  return list.length === 1
    ? `Unknown name "${list[0]}"; define it to use it here`
    : `Unknown names: ${list.map((name) => `"${name}"`).join(', ')}`;
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
