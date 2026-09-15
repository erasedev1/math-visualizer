import { describe, expect, it } from 'vitest';
import { parseDefinition } from '@/core/expression/definition';
import { toSource } from '@/core/expression/print';

describe('parseDefinition', () => {
  it('recognises a function definition', () => {
    const definition = parseDefinition('f(x) = a sin(x)');
    expect(definition.kind).toBe('function');
    if (definition.kind !== 'function') throw new Error('expected a function');
    expect(definition.name).toBe('f');
    expect(definition.params).toEqual(['x']);
    expect(toSource(definition.body)).toBe('a sin(x)');
  });

  it('recognises a multi-parameter function definition', () => {
    const definition = parseDefinition('g(x, y) = x^2 + y^2');
    if (definition.kind !== 'function') throw new Error('expected a function');
    expect(definition.params).toEqual(['x', 'y']);
    expect(toSource(definition.body)).toBe('x^2 + y^2');
  });

  it('recognises a variable definition', () => {
    const definition = parseDefinition('a = 2');
    expect(definition.kind).toBe('variable');
    if (definition.kind !== 'variable') throw new Error('expected a variable');
    expect(definition.name).toBe('a');
    expect(toSource(definition.body)).toBe('2');
  });

  it('treats y = ... as a variable definition named y', () => {
    const definition = parseDefinition('y = x^2');
    if (definition.kind !== 'variable') throw new Error('expected a variable');
    expect(definition.name).toBe('y');
    expect(toSource(definition.body)).toBe('x^2');
  });

  it('recognises a bare expression', () => {
    const definition = parseDefinition('x^2 + 1');
    expect(definition.kind).toBe('expression');
    expect(toSource(definition.body)).toBe('x^2 + 1');
  });

  it('does not mistake a product for a function header', () => {
    // `a(x + 1)` has no "=", so it stays an expression, not a definition.
    const definition = parseDefinition('a(x + 1)');
    expect(definition.kind).toBe('expression');
    expect(toSource(definition.body)).toBe('a(x + 1)');
  });

  it('rejects a definition whose left side is not a name or header', () => {
    expect(() => parseDefinition('2 + 2 = 4')).toThrow(/left side/);
    expect(() => parseDefinition('f(2) = x')).toThrow(/left side/);
  });

  it('rejects an empty or duplicated parameter list', () => {
    // `f()` is not a header, so it falls through to the expression parser.
    expect(() => parseDefinition('f() = 1')).toThrow(/Expected a value/);
    expect(() => parseDefinition('f(x, x) = 1')).toThrow(/distinct/);
  });

  it('rejects a definition with no right-hand side', () => {
    expect(() => parseDefinition('f(x) =')).toThrow(/no right-hand side/);
    expect(() => parseDefinition('a =')).toThrow(/Expected a value/);
  });
});
