/**
 * Prime notation.
 *
 * `f'` is how a derivative is written by hand, so it is how it is written here:
 * the tokenizer lets an identifier end in primes, and this module is the one
 * place that knows what those primes mean. A primed name is never defined
 * directly — `f'` says something about `f`, and letting both be defined would
 * make the notation a lie.
 */

export const PRIME = "'";

export interface PrimedName {
  /** The name with its primes removed. */
  readonly base: string;
  /** How many primes were on it: 0 for an ordinary name. */
  readonly order: number;
}

export function splitPrimes(name: string): PrimedName {
  let order = 0;
  while (name.endsWith(PRIME, name.length - order)) order += 1;
  return { base: name.slice(0, name.length - order), order };
}

export function primedName(base: string, order: number): string {
  return base + PRIME.repeat(order);
}
