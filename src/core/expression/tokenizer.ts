import { ExpressionError } from './errors';

export type TokenType =
  | 'number'
  | 'identifier'
  | 'operator'
  | 'lparen'
  | 'rparen'
  | 'lbracket'
  | 'rbracket'
  | 'langle'
  | 'rangle'
  | 'comma'
  | 'eof';

export interface Token {
  readonly type: TokenType;
  /** Exact source text of the token. */
  readonly value: string;
  readonly start: number;
  readonly end: number;
  /** Parsed value, present only on `number` tokens. */
  readonly numeric?: number;
}

const IDENT_START = /[A-Za-z_Α-ω]/;
const IDENT_PART = /[A-Za-z0-9_Α-ω]/;
const DIGIT = /[0-9]/;
const WHITESPACE = /\s/;
const PRIME = "'";

const DELIMITERS: Readonly<Record<string, TokenType | undefined>> = {
  '[': 'lbracket',
  ']': 'rbracket',
  '<': 'langle',
  '>': 'rangle',
};

/** Multi-character operators must be listed before their prefixes. */
const OPERATORS = ['**', '+', '-', '*', '/', '^', '='] as const;

function isIdentStart(ch: string | undefined): boolean {
  return ch !== undefined && IDENT_START.test(ch);
}

function isIdentPart(ch: string | undefined): boolean {
  return ch !== undefined && IDENT_PART.test(ch);
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && DIGIT.test(ch);
}

/**
 * Turns source text into a token stream terminated by a single `eof` token.
 *
 * Identifiers are matched greedily, so `xy` is one variable named `xy` rather
 * than `x * y`. Multi-letter names matter more than saving a multiplication
 * sign, and `x*y` or `x y` remain available for the product.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i]!;

    if (WHITESPACE.test(ch)) {
      i += 1;
      continue;
    }

    if (isDigit(ch) || (ch === '.' && isDigit(source[i + 1]))) {
      const start = i;
      while (isDigit(source[i])) i += 1;
      if (source[i] === '.') {
        i += 1;
        while (isDigit(source[i])) i += 1;
      }
      // An exponent only counts when digits actually follow, so `2e` stays
      // `2 * e` (Euler's number) while `2e3` is 2000.
      if (source[i] === 'e' || source[i] === 'E') {
        let lookahead = i + 1;
        if (source[lookahead] === '+' || source[lookahead] === '-') lookahead += 1;
        if (isDigit(source[lookahead])) {
          i = lookahead;
          while (isDigit(source[i])) i += 1;
        }
      }
      const text = source.slice(start, i);
      const numeric = Number(text);
      if (!Number.isFinite(numeric)) {
        throw new ExpressionError(`"${text}" is not a valid number`, start, i);
      }
      tokens.push({ type: 'number', value: text, start, end: i, numeric });
      continue;
    }

    if (isIdentStart(ch)) {
      const start = i;
      i += 1;
      while (isIdentPart(source[i])) i += 1;
      // Trailing primes belong to the name: `f'` is how a derivative is
      // written by hand, and what it means is decided later, by whatever
      // resolves names. The tokenizer only has to keep the two together.
      while (source[i] === PRIME) i += 1;
      tokens.push({ type: 'identifier', value: source.slice(start, i), start, end: i });
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch, start: i, end: i + 1 });
      i += 1;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch, start: i, end: i + 1 });
      i += 1;
      continue;
    }

    if (ch === ',') {
      tokens.push({ type: 'comma', value: ch, start: i, end: i + 1 });
      i += 1;
      continue;
    }

    // Brackets delimit matrices, angles delimit vectors. Neither doubles as a
    // comparison operator, which the language does not have.
    const delimiter = DELIMITERS[ch];
    if (delimiter !== undefined) {
      tokens.push({ type: delimiter, value: ch, start: i, end: i + 1 });
      i += 1;
      continue;
    }

    const operator = OPERATORS.find((candidate) => source.startsWith(candidate, i));
    if (operator !== undefined) {
      tokens.push({
        type: 'operator',
        // `**` is accepted as a synonym for `^` and normalised here.
        value: operator === '**' ? '^' : operator,
        start: i,
        end: i + operator.length,
      });
      i += operator.length;
      continue;
    }

    throw new ExpressionError(`Unexpected character "${ch}"`, i, i + 1);
  }

  tokens.push({ type: 'eof', value: '', start: source.length, end: source.length });
  return tokens;
}

export function eofToken(source: string): Token {
  return { type: 'eof', value: '', start: source.length, end: source.length };
}
