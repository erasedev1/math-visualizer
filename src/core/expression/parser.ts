import {
  binary,
  call,
  equality,
  id,
  num,
  tuple,
  unary,
  type Expr,
  type Root,
  type UnaryOperator,
} from './ast';
import { ExpressionError } from './errors';
import { BUILTIN_FUNCTIONS } from './functions';
import { eofToken, tokenize, type Token } from './tokenizer';

export interface ParseOptions {
  /**
   * Decides whether `name(...)` is a function call or an implicit product.
   * Without this, `x(x+1)` would parse as a call to `x`. Later milestones pass
   * a predicate that also knows about user-defined functions.
   */
  readonly isFunction?: (name: string) => boolean;
}

const defaultIsFunction = (name: string): boolean => BUILTIN_FUNCTIONS.has(name);

/**
 * Recursive-descent parser.
 *
 * Grammar (lowest precedence first):
 *
 *   root           := expression ('=' expression)?
 *   expression     := term (('+' | '-') term)*
 *   term           := unary ( ('*' | '/') unary | unary )*        // juxtaposition = product
 *   unary          := ('+' | '-') unary | power
 *   power          := primary ('^' unary)?                        // right associative
 *   primary        := number | identifier | call | '(' expression ')'
 *   call           := identifier '(' expression (',' expression)* ')'
 */
class Parser {
  private index = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly isFunction: (name: string) => boolean,
  ) {}

  private peek(offset = 0): Token {
    return this.tokens[this.index + offset] ?? this.tokens[this.tokens.length - 1]!;
  }

  private next(): Token {
    const token = this.peek();
    if (token.type !== 'eof') this.index += 1;
    return token;
  }

  private isOperator(value: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token.type === 'operator' && token.value === value;
  }

  private expect(type: Token['type'], description: string): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new ExpressionError(
        `Expected ${description} but found ${describeToken(token)}`,
        token.start,
        token.end,
      );
    }
    return this.next();
  }

  parseRoot(): Root {
    const left = this.parseExpression();
    if (this.isOperator('=')) {
      this.next();
      const right = this.parseExpression();
      if (this.isOperator('=')) {
        const extra = this.peek();
        throw new ExpressionError(
          'Only one "=" is allowed in an expression',
          extra.start,
          extra.end,
        );
      }
      this.expectEnd();
      return equality(left, right);
    }
    this.expectEnd();
    return left;
  }

  parseExpressionOnly(): Expr {
    const expr = this.parseExpression();
    if (this.isOperator('=')) {
      const token = this.peek();
      throw new ExpressionError('"=" is not allowed here', token.start, token.end);
    }
    this.expectEnd();
    return expr;
  }

  private expectEnd(): void {
    const token = this.peek();
    if (token.type !== 'eof') {
      throw new ExpressionError(`Unexpected ${describeToken(token)}`, token.start, token.end);
    }
  }

  private parseExpression(): Expr {
    let left = this.parseTerm();
    while (this.isOperator('+') || this.isOperator('-')) {
      const operator = this.next().value as '+' | '-';
      const right = this.parseTerm();
      left = binary(operator, left, right);
    }
    return left;
  }

  private parseTerm(): Expr {
    let left = this.parseUnary();
    for (;;) {
      if (this.isOperator('*') || this.isOperator('/')) {
        const operator = this.next().value as '*' | '/';
        left = binary(operator, left, this.parseUnary());
        continue;
      }
      if (this.startsPrimary()) {
        // Juxtaposition: `2x`, `3(x+1)`, `2pi`, `sin(x)cos(x)`.
        left = binary('*', left, this.parseUnary(), true);
        continue;
      }
      return left;
    }
  }

  /** True when the current token could begin a primary expression. */
  private startsPrimary(): boolean {
    const token = this.peek();
    return token.type === 'number' || token.type === 'identifier' || token.type === 'lparen';
  }

  private parseUnary(): Expr {
    if (this.isOperator('+') || this.isOperator('-')) {
      const operator = this.next().value as UnaryOperator;
      return unary(operator, this.parseUnary());
    }
    return this.parsePower();
  }

  private parsePower(): Expr {
    const base = this.parsePrimary();
    if (this.isOperator('^')) {
      this.next();
      // The exponent is parsed as a unary expression so that `2^-1` works and
      // `2^3^2` associates to the right.
      return binary('^', base, this.parseUnary());
    }
    return base;
  }

  private parsePrimary(): Expr {
    const token = this.peek();

    switch (token.type) {
      case 'number':
        this.next();
        return num(token.numeric!);

      case 'identifier': {
        this.next();
        if (this.peek().type === 'lparen' && this.isFunction(token.value)) {
          return this.parseCallArguments(token);
        }
        return id(token.value);
      }

      case 'lparen': {
        this.next();
        const elements = [this.parseExpression()];
        while (this.peek().type === 'comma') {
          this.next();
          elements.push(this.parseExpression());
        }
        this.expect('rparen', '")"');
        // One element is grouping; more is a coordinate pair.
        return elements.length === 1 ? elements[0]! : tuple(elements);
      }

      case 'operator':
        throw new ExpressionError(
          `Expected a value but found "${token.value}"`,
          token.start,
          token.end,
        );

      default:
        throw new ExpressionError(
          `Expected a value but found ${describeToken(token)}`,
          token.start,
          token.end,
        );
    }
  }

  private parseCallArguments(name: Token): Expr {
    this.expect('lparen', '"("');
    const args: Expr[] = [];
    if (this.peek().type !== 'rparen') {
      args.push(this.parseExpression());
      while (this.peek().type === 'comma') {
        this.next();
        args.push(this.parseExpression());
      }
    }
    this.expect('rparen', '")"');
    return call(name.value, args);
  }
}

function describeToken(token: Token): string {
  if (token.type === 'eof') return 'the end of the expression';
  return `"${token.value}"`;
}

function makeParser(input: string | readonly Token[], options: ParseOptions): Parser {
  const tokens = typeof input === 'string' ? tokenize(input) : input;
  return new Parser(tokens, options.isFunction ?? defaultIsFunction);
}

/** Parses a full source string, which may be an equality. */
export function parse(input: string | readonly Token[], options: ParseOptions = {}): Root {
  return makeParser(input, options).parseRoot();
}

/** Parses a source string that must be a plain expression. */
export function parseExpression(
  input: string | readonly Token[],
  options: ParseOptions = {},
): Expr {
  return makeParser(input, options).parseExpressionOnly();
}

export { eofToken };
