import type { BinaryOperator, Expr, Root } from './ast';
import { isExpr } from './ast';
import { ExpressionError } from './errors';
import {
  arityMessage,
  BUILTIN_CONSTANTS,
  BUILTIN_FUNCTIONS,
  type FunctionRegistry,
} from './functions';

/** A compiled expression: positional arguments in, one number out. */
export type CompiledFn = (args?: readonly number[]) => number;

export interface CompileOptions {
  /** Names bound to positional arguments, in order. */
  readonly params?: readonly string[];
  /** Named values available to the expression. Defaults to the built-in constants. */
  readonly constants?: Readonly<Record<string, number>>;
  readonly functions?: FunctionRegistry;
}

interface Compiled {
  readonly fn: CompiledFn;
  /** True when the subtree contains no parameters and can be folded. */
  readonly constant: boolean;
}

const EMPTY_ARGS: readonly number[] = [];

/**
 * Compiles an expression into a tree of closures.
 *
 * Plotting evaluates the same expression thousands of times per frame, so the
 * AST is walked once here instead of once per sample. Constant subtrees are
 * folded at compile time, and unknown names fail here rather than silently
 * producing NaN at every sample.
 */
export function compile(node: Expr, options: CompileOptions = {}): CompiledFn {
  const params = options.params ?? [];
  const constants = options.constants ?? BUILTIN_CONSTANTS;
  const functions = options.functions ?? BUILTIN_FUNCTIONS;
  return compileNode(node, params, constants, functions).fn;
}

/** Evaluates an expression once. Prefer `compile` for repeated evaluation. */
export function evaluate(
  node: Root,
  scope: { variables?: Readonly<Record<string, number>>; functions?: FunctionRegistry } = {},
): number {
  if (!isExpr(node)) {
    throw new ExpressionError('An equation cannot be evaluated as a value');
  }
  const constants = { ...BUILTIN_CONSTANTS, ...(scope.variables ?? {}) };
  const options: CompileOptions =
    scope.functions === undefined ? { constants } : { constants, functions: scope.functions };
  return compile(node, options)(EMPTY_ARGS);
}

function constantFold(value: number): Compiled {
  return { fn: () => value, constant: true };
}

function compileNode(
  node: Expr,
  params: readonly string[],
  constants: Readonly<Record<string, number>>,
  functions: FunctionRegistry,
): Compiled {
  switch (node.type) {
    case 'Number':
      return constantFold(node.value);

    case 'Identifier': {
      const paramIndex = params.indexOf(node.name);
      if (paramIndex >= 0) {
        return { fn: (args = EMPTY_ARGS) => args[paramIndex] ?? NaN, constant: false };
      }
      if (Object.hasOwn(constants, node.name)) {
        return constantFold(constants[node.name]!);
      }
      if (functions.has(node.name)) {
        throw new ExpressionError(
          `"${node.name}" is a function; write ${node.name}(...) to call it`,
        );
      }
      throw new ExpressionError(`Unknown name "${node.name}"`);
    }

    case 'Unary': {
      const inner = compileNode(node.argument, params, constants, functions);
      if (node.operator === '+') return inner;
      const { fn } = inner;
      if (inner.constant) return constantFold(-fn(EMPTY_ARGS));
      return { fn: (args = EMPTY_ARGS) => -fn(args), constant: false };
    }

    case 'Binary': {
      const left = compileNode(node.left, params, constants, functions);
      const right = compileNode(node.right, params, constants, functions);
      const a = left.fn;
      const b = right.fn;
      const apply = binaryApplier(node.operator, a, b);
      if (left.constant && right.constant) return constantFold(apply(EMPTY_ARGS));
      return { fn: apply, constant: false };
    }

    case 'Tuple':
      throw new ExpressionError(
        `A ${node.elements.length === 2 ? 'point' : 'list'} cannot be used where a number is expected`,
      );

    case 'Call': {
      const definition = functions.get(node.callee);
      if (definition === undefined) {
        throw new ExpressionError(`Unknown function "${node.callee}"`);
      }
      if (node.args.length < definition.minArgs || node.args.length > definition.maxArgs) {
        throw new ExpressionError(
          `${arityMessage(definition)}, but got ${node.args.length}`,
        );
      }
      const compiledArgs = node.args.map((arg) => compileNode(arg, params, constants, functions));
      const argFns = compiledArgs.map((arg) => arg.fn);
      const allConstant = compiledArgs.every((arg) => arg.constant);
      const { apply } = definition;

      let fn: CompiledFn;
      if (argFns.length === 1) {
        const [only] = argFns as [CompiledFn];
        fn = (args = EMPTY_ARGS) => apply([only(args)]);
      } else if (argFns.length === 2) {
        const [first, second] = argFns as [CompiledFn, CompiledFn];
        fn = (args = EMPTY_ARGS) => apply([first(args), second(args)]);
      } else {
        fn = (args = EMPTY_ARGS) => apply(argFns.map((argFn) => argFn(args)));
      }

      if (allConstant) return constantFold(fn(EMPTY_ARGS));
      return { fn, constant: false };
    }
  }
}

function binaryApplier(
  operator: BinaryOperator,
  a: CompiledFn,
  b: CompiledFn,
): CompiledFn {
  switch (operator) {
    case '+':
      return (args = EMPTY_ARGS) => a(args) + b(args);
    case '-':
      return (args = EMPTY_ARGS) => a(args) - b(args);
    case '*':
      return (args = EMPTY_ARGS) => a(args) * b(args);
    case '/':
      return (args = EMPTY_ARGS) => a(args) / b(args);
    case '^':
      return (args = EMPTY_ARGS) => Math.pow(a(args), b(args));
  }
}
