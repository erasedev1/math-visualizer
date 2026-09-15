import type { Expr } from './ast';
import { ExpressionError } from './errors';
import { parse, parseExpression } from './parser';
import { eofToken, tokenize, type Token } from './tokenizer';
import type { ParseOptions } from './parser';

/** What a line of input means. */
export type Definition =
  /** `f(x) = ...` */
  | { readonly kind: 'function'; readonly name: string; readonly params: readonly string[]; readonly body: Expr }
  /** `a = ...` */
  | { readonly kind: 'variable'; readonly name: string; readonly body: Expr }
  /** A bare expression such as `x^2`. */
  | { readonly kind: 'expression'; readonly body: Expr };

/**
 * Splits a source line into a definition header and a body.
 *
 * The header is recognised on the token stream rather than on the parsed tree
 * because `f(x)` on its own parses as the product `f * x` — the parser cannot
 * know `f` is being defined until the `=` is seen.
 */
export function parseDefinition(source: string, options: ParseOptions = {}): Definition {
  const tokens = tokenize(source);
  const header = matchFunctionHeader(tokens);

  if (header !== null) {
    const body = parseExpression(bodyTokens(tokens, header.bodyStart, source), options);
    return { kind: 'function', name: header.name, params: header.params, body };
  }

  const first = tokens[0];
  const second = tokens[1];
  if (
    first?.type === 'identifier' &&
    second?.type === 'operator' &&
    second.value === '=' &&
    tokens.length > 2
  ) {
    const body = parseExpression(bodyTokens(tokens, 2, source), options);
    return { kind: 'variable', name: first.value, body };
  }

  const root = parse(tokens, options);
  if (root.type === 'Equality') {
    throw new ExpressionError(
      'The left side of "=" must be a name, as in "a = 2", or a function header, as in "f(x) = ..."',
    );
  }
  return { kind: 'expression', body: root };
}

/**
 * The name a line defines, read from tokens alone.
 *
 * Parsing a body needs to know which names are functions (so that `f(2)` is a
 * call rather than a product), but that set is only known once every line's
 * header has been read. Header reading therefore has to work without parsing,
 * which it can: a header is a fixed token pattern.
 */
export function readDefinitionHeader(source: string): DefinitionHeader | null {
  let tokens: readonly Token[];
  try {
    tokens = tokenize(source);
  } catch {
    // A line that does not even tokenise defines nothing; the error surfaces
    // when the line is parsed for real.
    return null;
  }

  try {
    const header = matchFunctionHeader(tokens);
    if (header !== null) {
      return { kind: 'function', name: header.name, params: header.params };
    }
  } catch {
    return null;
  }

  const first = tokens[0];
  const second = tokens[1];
  if (
    first?.type === 'identifier' &&
    second?.type === 'operator' &&
    second.value === '=' &&
    tokens.length > 2
  ) {
    return { kind: 'variable', name: first.value, params: [] };
  }

  return null;
}

export interface DefinitionHeader {
  readonly kind: 'function' | 'variable';
  readonly name: string;
  readonly params: readonly string[];
}

function bodyTokens(tokens: readonly Token[], from: number, source: string): Token[] {
  return [...tokens.slice(from), eofToken(source)];
}

interface FunctionHeader {
  readonly name: string;
  readonly params: readonly string[];
  /** Index of the first body token, just after the `=`. */
  readonly bodyStart: number;
}

/** Matches `name ( p1 , p2 ... ) =` at the start of the token stream. */
function matchFunctionHeader(tokens: readonly Token[]): FunctionHeader | null {
  if (tokens[0]?.type !== 'identifier' || tokens[1]?.type !== 'lparen') return null;

  const params: string[] = [];
  let i = 2;
  for (;;) {
    const token = tokens[i];
    if (token?.type !== 'identifier') return null;
    params.push(token.value);
    i += 1;
    const separator = tokens[i];
    if (separator?.type === 'comma') {
      i += 1;
      continue;
    }
    if (separator?.type === 'rparen') {
      i += 1;
      break;
    }
    return null;
  }

  const assign = tokens[i];
  if (assign?.type !== 'operator' || assign.value !== '=') return null;
  if (new Set(params).size !== params.length) {
    throw new ExpressionError('Parameter names must be distinct', tokens[0]!.start, assign.end);
  }
  if (tokens[i + 1]?.type === 'eof') {
    throw new ExpressionError('This definition has no right-hand side', assign.start, assign.end);
  }

  return { name: tokens[0]!.value, params, bodyStart: i + 1 };
}
