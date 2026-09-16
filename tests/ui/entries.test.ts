import { describe, expect, it } from 'vitest';
import {
  createEntry,
  isTrailingBlank,
  matrixSource,
  vectorSource,
  withBody,
  withTrailingBlank,
  withValue,
  type ExpressionEntry,
} from '@/ui/state/entries';

const entry = (source: string): ExpressionEntry => ({ ...createEntry(source), id: 'e' });

describe('withBody', () => {
  it('keeps the name in front of a definition', () => {
    expect(withBody(entry('M = [[1, 2]]'), 'M', '[[3, 4]]').source).toBe('M = [[3, 4]]');
  });

  it('replaces the whole source when the entry has no name', () => {
    // A bare expression is its own body, so there is no "name =" to restore.
    expect(withBody(entry('[[1, 2]]'), null, '[[3, 4]]').source).toBe('[[3, 4]]');
  });

  it('leaves everything else about the entry alone', () => {
    const before = { ...entry('A = (1, 2)'), colorIndex: 3, visible: false };
    const after = withBody(before, 'A', '(5, 6)');
    expect(after.colorIndex).toBe(3);
    expect(after.visible).toBe(false);
    expect(after.id).toBe(before.id);
  });
});

describe('withValue', () => {
  it('writes a named parameter back with the step precision', () => {
    expect(withValue(entry('a = 1'), 'a', 2.345, 0.1).source).toBe('a = 2.3');
    expect(withValue(entry('a = 1'), 'a', 2.345, 0.01).source).toBe('a = 2.35');
  });

  it('writes an unnamed number back on its own', () => {
    expect(withValue(entry('5'), null, 7.5, 0.1).source).toBe('7.5');
  });
});

describe('matrixSource and vectorSource', () => {
  it('writes one bracketed list per row', () => {
    expect(matrixSource([[1, 2], [3, 4]])).toBe('[[1, 2], [3, 4]]');
  });

  it('writes a single row without nesting it', () => {
    expect(matrixSource([[1, 2, 3]])).toBe('[1, 2, 3]');
  });

  it('writes vector components between angle brackets', () => {
    expect(vectorSource([3, -4])).toBe('<3, -4>');
  });

  it('round-trips through the entry it came from', () => {
    const updated = withBody(entry('[[1, 2], [3, 4]]'), null, matrixSource([[9, 2], [3, 4]]));
    expect(updated.source).toBe('[[9, 2], [3, 4]]');
  });
});

describe('withTrailingBlank', () => {
  it('adds a blank row when the last one is used', () => {
    const entries = [entry('x^2')];
    const next = withTrailingBlank(entries, 8);
    expect(next).toHaveLength(2);
    expect(next[1]?.source).toBe('');
  });

  it('returns the same array when a blank row is already there', () => {
    const entries = [entry('x^2'), entry('')];
    // Reference equality is what lets React skip a render.
    expect(withTrailingBlank(entries, 8)).toBe(entries);
  });

  it('treats whitespace as blank', () => {
    const entries = [entry('   ')];
    expect(withTrailingBlank(entries, 8)).toBe(entries);
  });

  it('gives an empty list somewhere to start', () => {
    expect(withTrailingBlank([], 8)).toHaveLength(1);
  });
});

describe('isTrailingBlank', () => {
  it('is true only for a blank row at the end', () => {
    const entries = [entry('x^2'), entry('')];
    expect(isTrailingBlank(entries, 1)).toBe(true);
    expect(isTrailingBlank(entries, 0)).toBe(false);
  });

  it('is false for a blank row in the middle', () => {
    const entries = [entry(''), entry('x^2')];
    expect(isTrailingBlank(entries, 0)).toBe(false);
  });
});

describe('a new entry', () => {
  it('draws no matrix until asked, so a matrix is a grid before it is a picture', () => {
    expect(createEntry('M = [[1, 2], [3, 4]]').matrixDrawing).toBe('none');
  });
});
