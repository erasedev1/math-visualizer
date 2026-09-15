/**
 * All expression-layer failures use this error type so the UI can underline the
 * offending span instead of showing an opaque message.
 */
export class ExpressionError extends Error {
  readonly start: number;
  readonly end: number;

  constructor(message: string, start = 0, end = start) {
    super(message);
    this.name = 'ExpressionError';
    this.start = start;
    this.end = end;
  }
}

export function isExpressionError(value: unknown): value is ExpressionError {
  return value instanceof ExpressionError;
}

/** Human-readable message for any thrown value. */
export function describeError(value: unknown): string {
  if (value instanceof Error) return value.message;
  return String(value);
}
