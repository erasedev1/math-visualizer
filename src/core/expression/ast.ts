/**
 * Expression AST.
 *
 * The tree is intentionally small and closed: every later subsystem (compiler,
 * printer, symbolic differentiation, dependency analysis) is a fold over these
 * node types, so adding a node type is a deliberate, reviewable change.
 */

export type BinaryOperator = '+' | '-' | '*' | '/' | '^';
export type UnaryOperator = '+' | '-';

export interface NumberNode {
  readonly type: 'Number';
  readonly value: number;
}

export interface IdentifierNode {
  readonly type: 'Identifier';
  readonly name: string;
}

export interface UnaryNode {
  readonly type: 'Unary';
  readonly operator: UnaryOperator;
  readonly argument: Expr;
}

export interface BinaryNode {
  readonly type: 'Binary';
  readonly operator: BinaryOperator;
  readonly left: Expr;
  readonly right: Expr;
  /** True when the multiplication came from juxtaposition, as in `2x`. */
  readonly implicit: boolean;
}

export interface CallNode {
  readonly type: 'Call';
  readonly callee: string;
  readonly args: readonly Expr[];
}

/** An expression that can be evaluated to a number. */
export type Expr = NumberNode | IdentifierNode | UnaryNode | BinaryNode | CallNode;

/** `lhs = rhs`. Only valid at the top level of a source string. */
export interface EqualityNode {
  readonly type: 'Equality';
  readonly left: Expr;
  readonly right: Expr;
}

/** What a full source string parses to. */
export type Root = Expr | EqualityNode;

export const num = (value: number): NumberNode => ({ type: 'Number', value });

export const id = (name: string): IdentifierNode => ({ type: 'Identifier', name });

export const unary = (operator: UnaryOperator, argument: Expr): UnaryNode => ({
  type: 'Unary',
  operator,
  argument,
});

export const binary = (
  operator: BinaryOperator,
  left: Expr,
  right: Expr,
  implicit = false,
): BinaryNode => ({ type: 'Binary', operator, left, right, implicit });

export const call = (callee: string, args: readonly Expr[]): CallNode => ({
  type: 'Call',
  callee,
  args,
});

export const equality = (left: Expr, right: Expr): EqualityNode => ({
  type: 'Equality',
  left,
  right,
});

export function isExpr(node: Root): node is Expr {
  return node.type !== 'Equality';
}

/** Direct children of a node, in source order. */
export function children(node: Root): readonly Expr[] {
  switch (node.type) {
    case 'Number':
    case 'Identifier':
      return [];
    case 'Unary':
      return [node.argument];
    case 'Binary':
    case 'Equality':
      return [node.left, node.right];
    case 'Call':
      return node.args;
  }
}

/** Pre-order traversal. */
export function walk(node: Root, visit: (node: Root) => void): void {
  visit(node);
  for (const child of children(node)) walk(child, visit);
}

/** Every identifier name appearing in the tree, in first-seen order. */
export function identifiers(node: Root): string[] {
  const seen = new Set<string>();
  walk(node, (n) => {
    if (n.type === 'Identifier') seen.add(n.name);
  });
  return [...seen];
}

/** Every called function name appearing in the tree. */
export function calledFunctions(node: Root): string[] {
  const seen = new Set<string>();
  walk(node, (n) => {
    if (n.type === 'Call') seen.add(n.callee);
  });
  return [...seen];
}

/**
 * Identifiers that are not supplied by `known` (constants, parameters, ...).
 * This is the seed of the dependency analysis the reactive layer will need.
 */
export function freeVariables(node: Root, known: Iterable<string> = []): string[] {
  const knownSet = new Set(known);
  return identifiers(node).filter((name) => !knownSet.has(name));
}
