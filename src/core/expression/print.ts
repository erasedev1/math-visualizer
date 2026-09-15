import type { BinaryOperator, Expr, Root } from './ast';

const PRECEDENCE: Record<BinaryOperator, number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
  '^': 4,
};

const UNARY_PRECEDENCE = 3;
const ATOM_PRECEDENCE = Number.POSITIVE_INFINITY;
const IDENT_PART = /[A-Za-z0-9_Α-ω.]/;

const DIGIT_OR_DOT = /[0-9.]/;
const LETTER = /[A-Za-z_\u0391-\u03c9]/u;
/** An identifier such as `e3` would turn `2` `e3` into the number `2e3`. */
const EXPONENT_LIKE = /^[eE][0-9]/;

type Side = 'left' | 'right';

/**
 * Renders an AST back to source text with the minimum number of parentheses,
 * such that re-parsing the result yields the same tree. Used for round-trip
 * tests and for echoing normalised input back to the user.
 */
export function toSource(node: Root): string {
  if (node.type === 'Equality') {
    return `${toSource(node.left)} = ${toSource(node.right)}`;
  }
  return print(node);
}

/** Renders a node without any enclosing parentheses. */
function print(node: Expr): string {
  switch (node.type) {
    case 'Number':
      return formatNumber(node.value);

    case 'Identifier':
      return node.name;

    case 'Call':
      return `${node.callee}(${node.args.map(print).join(', ')})`;

    case 'Unary':
      return `${node.operator}${operand(node.argument, UNARY_PRECEDENCE, false, 'right')}`;

    case 'Binary': {
      const precedence = PRECEDENCE[node.operator];
      const rightAssociative = node.operator === '^';
      const left = operand(node.left, precedence, rightAssociative, 'left');
      const right = operand(node.right, precedence, rightAssociative, 'right');
      if (node.operator === '*' && node.implicit) return joinImplicit(left, right);
      if (node.operator === '^') return `${left}^${right}`;
      return `${left} ${node.operator} ${right}`;
    }
  }
}

/** Renders a child, parenthesising it only where the grammar requires it. */
function operand(
  node: Expr,
  parentPrecedence: number,
  parentIsRightAssociative: boolean,
  side: Side,
): string {
  const precedence = precedenceOf(node);
  const needsParens =
    precedence < parentPrecedence ||
    (precedence === parentPrecedence &&
      (parentIsRightAssociative ? side === 'left' : side === 'right'));
  const text = print(node);
  return needsParens ? `(${text})` : text;
}

function precedenceOf(node: Expr): number {
  switch (node.type) {
    case 'Binary':
      return PRECEDENCE[node.operator];
    case 'Unary':
      return UNARY_PRECEDENCE;
    case 'Number':
      // A negative literal behaves like a unary minus when re-parsed.
      return node.value < 0 ? UNARY_PRECEDENCE : ATOM_PRECEDENCE;
    case 'Identifier':
    case 'Call':
      return ATOM_PRECEDENCE;
  }
}

/**
 * Joins juxtaposed factors. A space goes in when omitting it would glue two
 * names into one (`x y` must not become `xy`), and parentheses go in when the
 * right factor starts with a sign (`2(-x)` must not become `2-x`).
 */
function joinImplicit(left: string, right: string): string {
  const lastOfLeft = left.at(-1);
  const firstOfRight = right.at(0);
  if (firstOfRight === '-' || firstOfRight === '+') return `${left}(${right})`;
  if (lastOfLeft === undefined || firstOfRight === undefined) return `${left}${right}`;

  const adjacentNames = IDENT_PART.test(lastOfLeft) && IDENT_PART.test(firstOfRight);
  // A digit followed by a name cannot merge into one token (`2x` re-reads as
  // `2 * x`), unless the name would be swallowed as an exponent.
  const coefficient =
    DIGIT_OR_DOT.test(lastOfLeft) && LETTER.test(firstOfRight) && !EXPONENT_LIKE.test(right);
  return adjacentNames && !coefficient ? `${left} ${right}` : `${left}${right}`;
}

export function formatNumber(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'infinity';
  if (value === -Infinity) return '-infinity';
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
  return String(Number(value.toPrecision(12)));
}
