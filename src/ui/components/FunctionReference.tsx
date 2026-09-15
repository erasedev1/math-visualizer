import { useMemo, useState } from 'react';
import { BUILTIN_CONSTANTS, BUILTIN_FUNCTION_LIST } from '@/core/expression/functions';
import { VALUE_FUNCTION_LIST } from '@/core/values/functions';

/**
 * Lists exactly what the engine can evaluate.
 *
 * It is generated from the registry rather than written by hand, so it cannot
 * drift into advertising functions that do not exist.
 */
export function FunctionReference(): React.JSX.Element {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filter = <T extends { name: string; description: string }>(list: readonly T[]) =>
      needle === ''
        ? list
        : list.filter(
            (definition) =>
              definition.name.includes(needle) ||
              definition.description.toLowerCase().includes(needle),
          );
    return { geometry: filter(VALUE_FUNCTION_LIST), numeric: filter(BUILTIN_FUNCTION_LIST) };
  }, [query]);

  const total = matches.geometry.length + matches.numeric.length;

  const constants = useMemo(
    () => Object.keys(BUILTIN_CONSTANTS).filter((name) => /^[a-z]+$/.test(name)),
    [],
  );

  return (
    <div className="field-group">
      <h3>Reference</h3>
      <p className="hint">
        Implicit multiplication is supported: <code>2x</code>, <code>3(x+1)</code>,{' '}
        <code>2pi</code>. Angles are in radians. <code>log</code> is base 10,{' '}
        <code>ln</code> is natural. A point is written <code>(3, 4)</code>.
      </p>
      <p className="hint">
        Write <code>f&#39;(x)</code> for the derivative of a function of one
        variable, and <code>f&#39;&#39;</code> for the second. It is
        differentiated symbolically, so it plots, composes and can be
        differentiated again.
      </p>
      <p className="hint">
        Constants: <code>{constants.join(', ')}</code>
      </p>
      <input
        className="search-input"
        value={query}
        placeholder="Search functions"
        aria-label="Search functions"
        onChange={(event) => setQuery(event.target.value)}
      />
      {matches.geometry.length > 0 && (
        <>
          <h4 className="reference-heading">Geometry</h4>
          <ul className="reference-list">
            {matches.geometry.map((definition) => (
              <li key={definition.name}>
                <code>{definition.signature}</code>
                <span>{definition.description}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {matches.numeric.length > 0 && (
        <>
          <h4 className="reference-heading">Numeric</h4>
          <ul className="reference-list">
            {matches.numeric.map((definition) => (
              <li key={definition.name}>
                <code>{definition.signature}</code>
                <span>
                  {definition.description}
                  {/* Read from the registry, so the list cannot claim a
                      derivative exists where no rule is declared. */}
                  {definition.derivative === undefined && (
                    <em className="reference-note"> · no derivative</em>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {total === 0 && <p className="hint">No matching function.</p>}
    </div>
  );
}
