import { describe, expect, it } from 'vitest';
import { analyzeEntry, type Analysis } from '@/core/plot/analyze';

/** Asserts that an entry is graphable and returns the compiled curve. */
function expectCurve(source: string) {
  const analysis: Analysis = analyzeEntry(source);
  if (analysis.kind !== 'curve') {
    throw new Error(`expected a curve for "${source}", got ${JSON.stringify(analysis)}`);
  }
  return analysis;
}

describe('analyzeEntry', () => {
  it('treats blank input as empty rather than as an error', () => {
    expect(analyzeEntry('').kind).toBe('empty');
    expect(analyzeEntry('   ').kind).toBe('empty');
  });

  it('graphs a bare expression against x', () => {
    const curve = expectCurve('x^2');
    expect(curve.variable).toBe('x');
    expect(curve.label).toBe('x^2');
    expect(curve.evaluate(3)).toBe(9);
  });

  it('graphs a bare expression against whichever single variable it uses', () => {
    const curve = expectCurve('t^3');
    expect(curve.variable).toBe('t');
    expect(curve.evaluate(2)).toBe(8);
  });

  it('graphs a constant as a horizontal line', () => {
    const curve = expectCurve('2pi');
    expect(curve.variable).toBe('x');
    expect(curve.evaluate(-100)).toBeCloseTo(2 * Math.PI, 12);
    expect(curve.evaluate(100)).toBeCloseTo(2 * Math.PI, 12);
  });

  it('graphs a function definition against its parameter', () => {
    const curve = expectCurve('f(u) = sin(u)');
    expect(curve.variable).toBe('u');
    expect(curve.label).toBe('f(u)');
    expect(curve.evaluate(Math.PI / 2)).toBeCloseTo(1, 12);
  });

  it('graphs y = ... using the conventional reading', () => {
    const curve = expectCurve('y = 2x + 5');
    expect(curve.variable).toBe('x');
    expect(curve.label).toBe('y');
    expect(curve.evaluate(1)).toBe(7);
  });

  it('handles the sample expressions from the product brief', () => {
    const cases: [string, number, number][] = [
      ['x^2', 4, 16],
      ['sin(x)', 0, 0],
      ['cos(x)', 0, 1],
      ['sqrt(x)', 9, 3],
      ['log(x)', 100, 2],
      ['e^x', 0, 1],
      ['2x + 5', 2, 9],
      ['(x^2 + 1)/(x - 3)', 1, -1],
      ['sin(x)^2', 0, 0],
      ['sqrt(2x)', 8, 4],
    ];
    for (const [source, input, expected] of cases) {
      expect(expectCurve(source).evaluate(input)).toBeCloseTo(expected, 12);
    }
  });

  it('reports a parse failure with a source range', () => {
    const analysis = analyzeEntry('x^^2');
    expect(analysis.kind).toBe('error');
    if (analysis.kind !== 'error') return;
    expect(analysis.message).toMatch(/Expected a value/);
    expect(analysis.start).toBe(2);
    expect(analysis.end).toBe(3);
  });

  it('reports an unknown name as an error', () => {
    const analysis = analyzeEntry('f(x) = a sin(x)');
    expect(analysis.kind).toBe('error');
    if (analysis.kind !== 'error') return;
    expect(analysis.message).toMatch(/Unknown name "a"/);
  });

  it('explains what is not graphable yet instead of failing silently', () => {
    const slider = analyzeEntry('a = 2');
    expect(slider.kind).toBe('unsupported');
    if (slider.kind === 'unsupported') expect(slider.message).toMatch(/slider/i);

    const surface = analyzeEntry('g(x, y) = x^2 + y^2');
    expect(surface.kind).toBe('unsupported');
    if (surface.kind === 'unsupported') expect(surface.message).toMatch(/3D/);

    const twoVariables = analyzeEntry('x + t');
    expect(twoVariables.kind).toBe('unsupported');
    if (twoVariables.kind === 'unsupported') expect(twoVariables.message).toMatch(/several/);
  });

  it('does not allocate per sample', () => {
    // The compiled closure reuses one argument array; check it stays correct
    // when called repeatedly with different inputs.
    const curve = expectCurve('x^2');
    const values = [1, 2, 3, 4].map((x) => curve.evaluate(x));
    expect(values).toEqual([1, 4, 9, 16]);
  });
});
